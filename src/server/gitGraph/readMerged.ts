import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { MergedBranch } from "@/common/gitGraph/types";
import { errorField } from "@/server/shared/ports";
import { runGit, tryGit } from "./git";

const execFileAsync = promisify(execFile);

const ROOT_NAMES = ["develop", "main", "master"];
const PATCH_SCAN_LIMIT = 500;
const CACHE_MS = 5 * 60_000;

export interface MergedPull {
  number: number;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  mergeSha: string | null;
}

export type ListMergedPulls = (worktreePath: string) => Promise<MergedPull[]>;

interface PullJson {
  number?: unknown;
  headRefName?: unknown;
  headRefOid?: unknown;
  baseRefName?: unknown;
  mergeCommit?: { oid?: unknown } | null;
}

export function parseMergedPulls(stdout: string): MergedPull[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((raw: PullJson): MergedPull[] => {
    if (typeof raw.number !== "number" || typeof raw.headRefName !== "string" || typeof raw.headRefOid !== "string" || typeof raw.baseRefName !== "string")
      return [];
    const oid = raw.mergeCommit?.oid;
    return [
      {
        number: raw.number,
        headRefName: raw.headRefName,
        headRefOid: raw.headRefOid,
        baseRefName: raw.baseRefName,
        mergeSha: typeof oid === "string" ? oid : null,
      },
    ];
  });
}

export const listMergedPulls: ListMergedPulls = async (worktreePath) => {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["pr", "list", "--state", "merged", "--limit", "100", "--json", "number,headRefName,headRefOid,baseRefName,mergeCommit"],
      { cwd: worktreePath, timeout: 15_000 },
    );
    return parseMergedPulls(stdout);
  } catch (error) {
    console.warn("[git-graph/merged] gh pr list failed", errorField(error, "stderr").trim() || String(error));
    return [];
  }
};

function pipeGit(cwd: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], {
      stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks: string[] = [];
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", () => resolve(chunks.join("")));
    child.stdin.end(input);
  });
}

/** `git patch-id --stable` lines: patch id → commit sha (the all-zero id for a single diff). */
async function patchIds(cwd: string, patch: string): Promise<Map<string, string>> {
  if (!patch.trim()) return new Map();
  const out = await pipeGit(cwd, ["patch-id", "--stable"], patch);
  return new Map(
    out.split("\n").flatMap((line) => {
      const [id, sha] = line.trim().split(" ");
      return id && sha ? [[id, sha] as const] : [];
    }),
  );
}

const isAncestor = async (cwd: string, ancestor: string, of: string) => (await tryGit(cwd, ["merge-base", "--is-ancestor", ancestor, of])) !== null;

/**
 * Local branches that already landed on a root branch by squash or rebase, which leaves no parent link in git.
 * A merged PR whose head is the branch tip decides first; otherwise the branch's whole diff is matched by
 * patch id against the root's commits since they forked. Branches merged with a merge commit are skipped —
 * the graph already draws that line.
 */
export class MergedReader {
  private readonly cache = new Map<string, { fingerprint: string; at: number; merged: Record<string, MergedBranch> }>();

  constructor(private readonly listPulls: ListMergedPulls = listMergedPulls) {}

  async read(worktreePath: string): Promise<Record<string, MergedBranch>> {
    const cache = this.cache;
    const listPulls = this.listPulls;
    const [commonDir, refList] = await Promise.all([
      runGit(worktreePath, ["rev-parse", "--git-common-dir"]),
      runGit(worktreePath, ["for-each-ref", "--format=%(refname)%09%(objectname)", "refs/heads", "refs/remotes/origin"]),
    ]);
    const key = commonDir.trim();
    const hit = cache.get(key);
    if (hit && hit.fingerprint === refList && Date.now() - hit.at < CACHE_MS) return hit.merged;

    const refs = new Map(
      refList.split("\n").flatMap((line) => {
        const [name, sha] = line.split("\t");
        return name && sha ? [[name, sha] as const] : [];
      }),
    );
    const roots = ROOT_NAMES.flatMap((name) => {
      const ref = refs.has(`refs/remotes/origin/${name}`) ? `refs/remotes/origin/${name}` : `refs/heads/${name}`;
      return refs.has(ref) ? [{ name, ref }] : [];
    });
    const branches = [...refs].flatMap(([ref, sha]) => {
      const name = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null;
      return name && !ROOT_NAMES.includes(name) ? [{ name, sha }] : [];
    });
    const merged: Record<string, MergedBranch> = {};
    if (roots.length === 0 || branches.length === 0) {
      cache.set(key, { fingerprint: refList, at: Date.now(), merged });
      return merged;
    }

    const pulls = await listPulls(worktreePath);
    const rootScans = new Map<string, Promise<Map<string, string>>>();
    const exists = async (sha: string) => (await tryGit(worktreePath, ["cat-file", "-e", `${sha}^{commit}`])) !== null;

    await Promise.all(
      branches.map(async ({ name, sha }) => {
        for (const pull of pulls.filter((each) => each.headRefName === name)) {
          if (pull.headRefOid !== sha && !(await isAncestor(worktreePath, sha, pull.headRefOid))) continue;
          merged[name] = {
            into: pull.baseRefName,
            sha: pull.mergeSha && (await exists(pull.mergeSha)) ? pull.mergeSha : null,
            pr: pull.number,
          };
          return;
        }
        for (const root of roots) {
          const base = await tryGit(worktreePath, ["merge-base", root.ref, sha]);
          if (!base || base === sha) continue;
          const own = await patchIds(worktreePath, await runGit(worktreePath, ["diff", "--no-color", base, sha]));
          const [id] = own.keys();
          if (!id) continue;
          const scanKey = `${root.ref}:${base}`;
          const scan =
            rootScans.get(scanKey) ??
            runGit(worktreePath, ["log", "-p", "--no-color", "--no-merges", `--max-count=${PATCH_SCAN_LIMIT}`, `${base}..${root.ref}`]).then((log) =>
              patchIds(worktreePath, log),
            );
          rootScans.set(scanKey, scan);
          const landed = (await scan).get(id);
          if (landed) {
            merged[name] = { into: root.name, sha: landed, pr: null };
            return;
          }
        }
      }),
    );
    cache.set(key, { fingerprint: refList, at: Date.now(), merged });
    return merged;
  }
}
