import { execFile } from "node:child_process";

/** Worktree folders from `git worktree list --porcelain`, bare and prunable entries left out. */
export function worktreeFoldersOf(stdout: string): string[] {
  return stdout
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").filter(Boolean))
    .flatMap((lines) => {
      const folder = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
      const skipped = lines.some((line) => line === "bare" || line.startsWith("prunable"));
      return folder && !skipped ? [folder] : [];
    });
}

const CACHE_MS = 3_000;

/**
 * Lists a project's worktrees as git sees them now, cached for a few seconds so one tool call that
 * checks many sessions runs git once. A folder that is not a git repository is its own only worktree.
 */
export function projectWorktreeLister(now: () => number = Date.now): (project: string) => Promise<string[]> {
  const cache = new Map<string, { at: number; folders: Promise<string[]> }>();
  return (project) => {
    const hit = cache.get(project);
    if (hit && now() - hit.at < CACHE_MS) return hit.folders;
    const folders = new Promise<string[]>((resolve) => {
      execFile("git", ["-C", project, "worktree", "list", "--porcelain"], { timeout: 10_000 }, (error, stdout) => {
        const listed = error ? [] : worktreeFoldersOf(String(stdout));
        resolve(listed.length > 0 ? listed : [project]);
      });
    });
    cache.set(project, { at: now(), folders });
    return folders;
  };
}
