export type GraphRefKind = "head" | "branch" | "remote" | "tag";

/** `head` marks a detached HEAD; an attached HEAD shows as its branch with `current`. */
export interface GraphRef {
  kind: GraphRefKind;
  name: string;
  current: boolean;
}

export interface GraphCommit {
  sha: string;
  parents: string[];
  author: string;
  time: number;
  subject: string;
  refs: GraphRef[];
}

export interface GraphWorktree {
  path: string;
  branch: string | null;
  headSha: string | null;
}

export interface GitGraph {
  worktreePath: string;
  headSha: string | null;
  currentBranch: string | null;
  commits: GraphCommit[];
  hasMore: boolean;
  /** Every worktree of the repository, so the graph can mark where each one stands. */
  worktrees: GraphWorktree[];
  /** Local branch name → path of the worktree that has it checked out. */
  checkedOut: Record<string, string>;
  /** Tracked files with uncommitted changes in this worktree; a switch is refused while above zero. */
  dirtyCount: number;
}

export type FileChangeStatus = "A" | "M" | "D" | "R" | "C" | "T";

export interface FileChange {
  status: FileChangeStatus;
  path: string;
  from: string | null;
}

export interface CommitDetail {
  sha: string;
  parents: string[];
  author: string;
  email: string;
  time: number;
  message: string;
  files: FileChange[];
}

export type GitGraphResponse = { ok: true; graph: GitGraph } | { ok: false; error: string };
export type CommitDetailResponse = { ok: true; commit: CommitDetail } | { ok: false; error: string };
export type SwitchBranchResponse = { ok: true; branch: string } | { ok: false; error: string };

export type WorkingFileState = "staged" | "unstaged" | "untracked" | "conflicted";

/** One path from `git status`; a file both staged and edited again shows twice, once per state. */
export interface WorkingFile {
  path: string;
  from: string | null;
  state: WorkingFileState;
  status: FileChangeStatus | "U" | "?";
}

export interface WorkingTree {
  headSha: string | null;
  files: WorkingFile[];
}

export type WorkingTreeResponse = { ok: true; tree: WorkingTree } | { ok: false; error: string };
export type WorkingDiffResponse = { ok: true; diff: string } | { ok: false; error: string };
