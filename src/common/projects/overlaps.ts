/** Two worktrees of one project that changed the same files since they left the root branch. */
export interface FileOverlap {
  /** worktreeId (folder path) of each side; `a` sorts before `b`. */
  a: string;
  b: string;
  files: string[];
}

export type FileOverlapsResponse = { ok: true; overlaps: FileOverlap[] } | { ok: false; error: string };
