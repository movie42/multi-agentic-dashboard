export const STATUS_KINDS = ["standby", "progress", "block", "review", "done"] as const;

export type StatusKind = (typeof STATUS_KINDS)[number];

export interface TodoStatus {
  id: string;
  name: string;
  kind: StatusKind;
}

export interface TodoColumn {
  id: string;
  name: string;
  statusIds: string[];
  hidden: boolean;
}

export interface TodoJira {
  key: string;
  url: string;
}

export interface TodoPendingLaunch {
  worktreePath: string;
  at: number;
}

export interface TodoCard {
  id: string;
  title: string;
  memo: string;
  statusId: string;
  jira: TodoJira[];
  sessionIds: string[];
  repo: string | null;
  worktreePath: string | null;
  hidden: boolean;
  autoMovedAt: number | null;
  pendingLaunch: TodoPendingLaunch | null;
  createdAt: number;
  updatedAt: number;
}

export interface TodoBoard {
  version: 1;
  statuses: TodoStatus[];
  columns: TodoColumn[];
  cards: TodoCard[];
}

export type TodoAutoEvent = "session-started" | "pr-opened";

export type TodoResponse =
  | { ok: true; board: TodoBoard; createdId?: string }
  | { ok: false; error: string };
