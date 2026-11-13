import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GraphWorktree } from "@/common/gitGraph/types";
import { errorField } from "@/server/shared/ports";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 32 * 1024 * 1024;

/** Runs git in `cwd`; a failure is rethrown with git's own stderr as the message. */
export async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { maxBuffer: MAX_BUFFER, timeout: 30_000 });
    return stdout;
  } catch (error) {
    const stderr = errorField(error, "stderr").trim();
    throw new Error(stderr || (error instanceof Error ? error.message : String(error)));
  }
}

export async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return (await runGit(cwd, args)).trim();
  } catch {
    return null;
  }
}

/** Each worktree from `git worktree list --porcelain`; a detached one has no branch. */
export function parseWorktreeEntries(stdout: string): GraphWorktree[] {
  return stdout.split(/\n\n+/).flatMap((block) => {
    const lines = block.split("\n");
    const value = (prefix: string) => lines.find((line) => line.startsWith(prefix))?.slice(prefix.length) ?? null;
    const worktreePath = value("worktree ");
    if (!worktreePath || lines.includes("bare")) return [];
    return [{ path: worktreePath, branch: value("branch refs/heads/"), headSha: value("HEAD ") }];
  });
}

/** Branch name → worktree path, from `git worktree list --porcelain`. */
export function parseWorktreeList(stdout: string): Record<string, string> {
  return Object.fromEntries(
    parseWorktreeEntries(stdout).flatMap((entry) => (entry.branch ? [[entry.branch, entry.path]] : [])),
  );
}

export async function dirtyCount(cwd: string): Promise<number> {
  const status = await runGit(cwd, ["status", "--porcelain", "--untracked-files=no"]);
  return status.split("\n").filter((line) => line.trim().length > 0).length;
}
