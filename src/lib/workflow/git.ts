import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PullRequestInfo, WorkflowMode } from "./types";

const execFileAsync = promisify(execFile);

const PR_TTL_MS = 60_000;
const MODE_TTL_MS = 10 * 60_000;
const SHARED_BRANCH = /^(main|master|develop|staging|release\/.+|main-.+|develop-.+)$/;

const prCache = new Map<string, { at: number; value: PullRequestInfo; pending?: Promise<void> }>();
const modeCache = new Map<string, { at: number; value: WorkflowMode }>();
let githubLogin: Promise<string | null> | null = null;

function getGithubLogin(): Promise<string | null> {
  githubLogin ??= execFileAsync("gh", ["api", "user", "-q", ".login"], { timeout: 10_000 })
    .then(({ stdout }) => stdout.trim() || null)
    .catch(() => null);
  return githubLogin;
}

async function remoteOwner(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "remote", "get-url", "origin"], {
      timeout: 5_000,
    });
    const match = stdout.trim().match(/github\.com[:/]([^/]+)\//);
    return match ? match[1] : "unknown-host";
  } catch {
    return null;
  }
}

export async function detectMode(repoPath: string): Promise<WorkflowMode> {
  const cached = modeCache.get(repoPath);
  if (cached && Date.now() - cached.at < MODE_TTL_MS) return cached.value;
  const [owner, login] = await Promise.all([remoteOwner(repoPath), getGithubLogin()]);
  const value: WorkflowMode =
    owner === null || (login !== null && owner.toLowerCase() === login.toLowerCase())
      ? "personal"
      : "company";
  modeCache.set(repoPath, { at: Date.now(), value });
  return value;
}

async function fetchPullRequest(worktreePath: string, branch: string): Promise<PullRequestInfo> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["pr", "list", "--head", branch, "--state", "all", "--limit", "1", "--json", "number,state,isDraft,url"],
      { cwd: worktreePath, timeout: 15_000 },
    );
    const list = JSON.parse(stdout) as {
      number: number;
      state: "OPEN" | "MERGED" | "CLOSED";
      isDraft: boolean;
      url: string;
    }[];
    return list[0] ? { kind: "found", ...list[0] } : { kind: "none" };
  } catch (error) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? String((error as { stderr: unknown }).stderr)
        : "";
    if (/no git remotes|not a git repository|none of the git remotes/i.test(stderr)) {
      return { kind: "not-applicable" };
    }
    console.warn("[pr]", worktreePath, branch, stderr.trim());
    return { kind: "unknown" };
  }
}

export function getPullRequest(worktreePath: string, branch: string | null): PullRequestInfo {
  if (!branch || SHARED_BRANCH.test(branch)) return { kind: "not-applicable" };
  const key = `${worktreePath}@${branch}`;
  const cached = prCache.get(key);
  const stale = !cached || Date.now() - cached.at > PR_TTL_MS;
  if (stale && !cached?.pending) {
    const pending = fetchPullRequest(worktreePath, branch).then((value) => {
      prCache.set(key, { at: Date.now(), value });
    });
    prCache.set(key, { at: cached?.at ?? 0, value: cached?.value ?? { kind: "loading" }, pending });
  }
  return prCache.get(key)?.value ?? { kind: "loading" };
}
