import "server-only";
import { tryGit } from "@/server/gitGraph/git";
import { resolveRange } from "@/server/intentDiff/gitDiff";
import type { WorktreeOverlap } from "@/common/projectOverview/types";

export interface ChangedFiles {
  path: string;
  files: string[];
}

/** Every pair of worktrees whose changed files intersect, in input order. */
export function pairOverlaps(changed: ChangedFiles[]): WorktreeOverlap[] {
  return changed.flatMap((left, index) =>
    changed.slice(index + 1).flatMap((right) => {
      const theirs = new Set(right.files);
      const files = left.files.filter((file) => theirs.has(file)).sort();
      return files.length > 0 ? [{ a: left.path, b: right.path, files }] : [];
    }),
  );
}

function lines(output: string | null): string[] {
  return output ? output.split("\n").filter(Boolean) : [];
}

/** Files changed since the worktree forked from its root branch: commits, uncommitted edits and untracked files. */
export async function changedFiles(worktreePath: string): Promise<string[]> {
  const range = await resolveRange({ worktreePath, base: null, head: null });
  const [tracked, untracked] = await Promise.all([
    tryGit(range.worktreePath, ["diff", "--name-only", "--no-renames", range.base]),
    tryGit(range.worktreePath, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...new Set([...lines(tracked), ...lines(untracked)])];
}

export async function readOverlaps(
  worktreePaths: string[],
  read: (worktreePath: string) => Promise<string[]> = changedFiles,
  warn: (error: unknown, worktreePath: string) => void = () => {},
): Promise<WorktreeOverlap[]> {
  const changed = await Promise.all(
    worktreePaths.map(async (path): Promise<ChangedFiles> => {
      try {
        return { path, files: await read(path) };
      } catch (error) {
        warn(error, path);
        return { path, files: [] };
      }
    }),
  );
  return pairOverlaps(changed);
}
