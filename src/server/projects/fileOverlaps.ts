import type { FileOverlap } from "@/common/projects/overlaps";
import { resolveRange } from "@/server/intentDiff/gitDiff";
import { runGit } from "@/server/gitGraph/git";

const lines = (stdout: string) => stdout.split("\n").map((line) => line.trim()).filter(Boolean);

/** Files a worktree changed since it left its root branch: commits, uncommitted edits and new files. */
export async function changedFiles(worktreePath: string): Promise<string[]> {
  const { base } = await resolveRange({ worktreePath, base: null, head: null });
  const [tracked, untracked] = await Promise.all([
    runGit(worktreePath, ["diff", "--name-only", base]),
    runGit(worktreePath, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...new Set([...lines(tracked), ...lines(untracked)])].sort();
}

/** Every pair of worktrees that share at least one changed file, in input order. */
export function pairOverlaps(changes: ReadonlyArray<readonly [string, readonly string[]]>): FileOverlap[] {
  return changes.flatMap(([a, aFiles], index) =>
    changes.slice(index + 1).flatMap(([b, bFiles]) => {
      const shared = new Set(bFiles);
      const files = aFiles.filter((file) => shared.has(file));
      return files.length > 0 ? [{ a, b, files }] : [];
    }),
  );
}

/** A worktree git cannot read (removed, no root branch) drops out instead of failing the whole project. */
export async function readFileOverlaps(worktreePaths: string[], warn: (scope: string, error: unknown, context?: Record<string, unknown>) => void): Promise<FileOverlap[]> {
  const changes = await Promise.all(
    worktreePaths.map(async (worktreePath) => {
      try {
        return [[worktreePath, await changedFiles(worktreePath)] as const];
      } catch (error) {
        warn("file-overlaps", error, { worktreePath });
        return [];
      }
    }),
  );
  return pairOverlaps(changes.flat());
}
