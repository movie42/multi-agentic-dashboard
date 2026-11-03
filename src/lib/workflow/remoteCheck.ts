import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FeatureCheck, FileOverlap } from "./types";

const execFileAsync = promisify(execFile);

const checks = new Map<string, FeatureCheck>();

export interface CheckWorktree {
  path: string;
  name: string;
  branch: string | null;
}

export interface CheckInput {
  featureId: string;
  root: string;
  repoPath: string;
  featureWorktrees: CheckWorktree[];
  repoWorktrees: CheckWorktree[];
}

export function getFeatureCheck(featureId: string): FeatureCheck {
  return checks.get(featureId) ?? { kind: "idle" };
}

async function git(cwd: string, args: string[], timeout = 15_000): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { timeout, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

function lines(output: string): string[] {
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function changedFiles(worktreePath: string, rootRef: string): Promise<Set<string>> {
  const base = (await git(worktreePath, ["merge-base", rootRef, "HEAD"])).trim();
  const [tracked, untracked] = await Promise.all([
    git(worktreePath, ["diff", "--name-only", base]),
    git(worktreePath, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return new Set([...lines(tracked), ...lines(untracked)]);
}

async function behindCount(worktreePath: string, rootRef: string): Promise<number> {
  return Number((await git(worktreePath, ["rev-list", "--count", `HEAD..${rootRef}`])).trim()) || 0;
}

async function runCheck(input: CheckInput): Promise<FeatureCheck> {
  const rootRef = `origin/${input.root}`;
  await git(input.repoPath, ["fetch", "origin", input.root], 60_000);

  const behind = (
    await Promise.all(
      input.featureWorktrees.map(async (worktree) => ({
        worktree: worktree.name,
        commits: await behindCount(worktree.path, rootRef),
      })),
    )
  ).filter((entry) => entry.commits > 0);

  const candidates = input.repoWorktrees.filter((worktree) => worktree.branch !== input.root);
  const files = new Map<string, Set<string>>();
  await Promise.all(
    candidates.map(async (worktree) => {
      try {
        files.set(worktree.path, await changedFiles(worktree.path, rootRef));
      } catch (error) {
        console.warn("[feature-check] changed files", worktree.path, error);
      }
    }),
  );

  const overlaps: FileOverlap[] = [];
  for (const mine of input.featureWorktrees) {
    const mineFiles = files.get(mine.path);
    if (!mineFiles) continue;
    for (const other of candidates) {
      if (other.path === mine.path) continue;
      const otherFiles = files.get(other.path);
      if (!otherFiles) continue;
      for (const file of mineFiles) {
        if (otherFiles.has(file)) {
          overlaps.push({ file, worktree: mine.name, otherWorktree: other.name, otherBranch: other.branch });
        }
      }
    }
  }

  return { kind: "done", at: Date.now(), root: input.root, behind, overlaps };
}

export function startFeatureCheck(input: CheckInput): void {
  if (checks.get(input.featureId)?.kind === "running") return;
  checks.set(input.featureId, { kind: "running", startedAt: Date.now() });
  runCheck(input)
    .then((result) => checks.set(input.featureId, result))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[feature-check]", input.featureId, message);
      checks.set(input.featureId, { kind: "failed", at: Date.now(), error: message });
    });
}
