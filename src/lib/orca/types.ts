import type { FlowTaskSummary, PullRequestInfo, WorkflowMode } from "@/lib/workflow/types";

export type AgentState = "working" | "done" | "blocked" | "waiting" | "idle";

export interface OrcaAgentRaw {
  paneKey: string;
  parentPaneKey: string | null;
  state: string;
  agentType: string | null;
  prompt: string | null;
  taskTitle: string | null;
  displayName: string | null;
  lastAssistantMessage: string | null;
  toolName: string | null;
  workingMode?: string | null;
  interrupted: boolean;
  stateStartedAt: number | null;
  updatedAt: number | null;
  hasLivePty: boolean;
  mainAgent?: { state: string; stateStartedAt: number | null } | null;
}

export interface OrcaWorktreeRaw {
  worktreeId: string;
  repoId: string;
  repo: string;
  path: string;
  branch: string | null;
  displayName: string | null;
  isArchived: boolean;
  isMainWorktree: boolean;
  isPinned: boolean;
  unread: boolean;
  status: string;
  lastActivityAt: number | null;
  lastOutputAt: number | null;
  agents: OrcaAgentRaw[];
}

export interface OrcaTerminalRaw {
  handle: string;
  tabId: string;
  leafId: string;
  worktreeId: string;
  title: string | null;
  connected: boolean;
}

export type ArtifactKind = "html" | "markdown" | "file" | "artifact" | "pr";

export interface Artifact {
  target: string;
  label: string;
  kind: ArtifactKind;
}

export interface AgentCard {
  id: string;
  worktreeId: string;
  repo: string;
  worktreeName: string;
  branch: string | null;
  worktreePath: string;
  agentType: string | null;
  state: AgentState;
  prompt: string | null;
  title: string | null;
  lastMessage: string | null;
  toolName: string | null;
  backgroundRunning: boolean;
  interrupted: boolean;
  stateSince: number | null;
  updatedAt: number | null;
  unread: boolean;
  terminalHandle: string | null;
  artifacts: Artifact[];
}

export interface WorktreeSummary {
  worktreeId: string;
  repo: string;
  name: string;
  branch: string | null;
  path: string;
  unread: boolean;
  lastActivityAt: number | null;
  flowTasks: FlowTaskSummary[];
  pullRequest: PullRequestInfo;
}

export interface ProjectSummary {
  repo: string;
  autoMode: WorkflowMode;
}

export interface BoardSnapshot {
  fetchedAt: number;
  projects: ProjectSummary[];
  worktrees: WorktreeSummary[];
  agents: AgentCard[];
}

export type BoardResponse =
  | { ok: true; board: BoardSnapshot }
  | { ok: false; error: string };
