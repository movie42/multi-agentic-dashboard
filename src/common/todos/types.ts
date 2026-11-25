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

export type TodoLinkKind = "slack" | "notion" | "figma" | "github-pr" | "other";

export interface TodoLink {
  kind: TodoLinkKind;
  url: string;
}

export type TodoCardOrigin = "jira" | null;

/** The Jira story a sub-issue belongs to; the schedule view shows the sub-issue under it. */
export interface TodoJiraParent {
  key: string;
  summary: string;
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
  links: TodoLink[];
  sessionIds: string[];
  /** Sessions the user detached; auto-linking never attaches them to this card again. */
  ignoredSessionIds: string[];
  repo: string | null;
  worktreePath: string | null;
  hidden: boolean;
  agentMovedAt: number | null;
  doneSuggestedAt: number | null;
  pendingLaunch: TodoPendingLaunch | null;
  /** When the card entered the last status; cleared when it leaves. */
  doneAt: number | null;
  /** Set a day after `doneAt`; archived cards leave the board and show in the archive list. */
  archivedAt: number | null;
  origin: TodoCardOrigin;
  /** Local calendar day "YYYY-MM-DD"; the sprint is the week holding it. Null means backlog. */
  dueDate: string | null;
  /** Local calendar day the work starts, never after `dueDate`; null shows the card as a single deadline mark. */
  startDate: string | null;
  jiraParent: TodoJiraParent | null;
  /** Whether the first Jira key's parent has been read; Jira is asked once per card. */
  jiraParentChecked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TodoSync {
  jiraImportedAt: number | null;
}

export interface TodoSettings {
  /** Weekday a sprint starts on, 0 = Sunday … 6 = Saturday. */
  weekStartsOn: number;
}

export interface TodoBoard {
  version: 1;
  statuses: TodoStatus[];
  columns: TodoColumn[];
  cards: TodoCard[];
  sync: TodoSync;
  settings: TodoSettings;
}

export type TodoMoveSource = "user" | "agent";

/** Jira status names by issue key, read through acli; a key still loading is absent. */
export type TodoJiraStatuses = Record<string, string>;

export type TodoResponse =
  | { ok: true; board: TodoBoard; createdId?: string }
  | { ok: false; error: string };

export type TodoJiraImportResponse =
  | { ok: true; added: number; total: number; board: TodoBoard }
  | { ok: false; error: string };

export type TodoJiraStatusResponse = { ok: true; statuses: TodoJiraStatuses } | { ok: false; error: string };
