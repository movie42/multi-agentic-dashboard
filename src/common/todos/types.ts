export interface TodoStatus {
  id: string;
  name: string;
  /** When a card belongs here, in one line; agents read it to decide moves. */
  description: string;
  /** Statuses an agent may move a card to from here. People may move anywhere. */
  next: string[];
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
  agentMovedAt: number | null;
  doneSuggestedAt: number | null;
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

export type TodoMoveSource = "user" | "agent";

export type TodoResponse =
  | { ok: true; board: TodoBoard; createdId?: string }
  | { ok: false; error: string };
