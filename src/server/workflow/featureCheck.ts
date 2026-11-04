import "server-only";
import type { FileOverlap } from "@/common/workflow/types";

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

export function outputLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function overlapCandidates(input: Pick<CheckInput, "root" | "repoWorktrees">): CheckWorktree[] {
  return input.repoWorktrees.filter((worktree) => worktree.branch !== input.root);
}

export function findOverlaps(
  featureWorktrees: CheckWorktree[],
  candidates: CheckWorktree[],
  files: ReadonlyMap<string, ReadonlySet<string>>,
): FileOverlap[] {
  return featureWorktrees.flatMap((mine) => {
    const mineFiles = files.get(mine.path);
    if (!mineFiles) return [];
    return candidates
      .filter((other) => other.path !== mine.path)
      .flatMap((other) => {
        const otherFiles = files.get(other.path);
        if (!otherFiles) return [];
        return [...mineFiles]
          .filter((file) => otherFiles.has(file))
          .map((file) => ({ file, worktree: mine.name, otherWorktree: other.name, otherBranch: other.branch }));
      });
  });
}
