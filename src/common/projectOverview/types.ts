/** Two worktrees of one project that change at least one file in common, by worktree path. */
export interface WorktreeOverlap {
  a: string;
  b: string;
  files: string[];
}

export type ProjectOverlapsResponse = { ok: true; overlaps: WorktreeOverlap[] } | { ok: false; error: string };
