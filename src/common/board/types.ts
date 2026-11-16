import type { SessionOrchestration } from "@/common/orchestration/types";
import type { RunnerPermission } from "@/common/runner/types";
import type { SessionRef } from "@/common/sessions/types";
import type { FeatureSummary, FlowTaskSummary, JiraIssueInfo, PullRequestInfo, WorkflowMode } from "@/common/workflow/types";

export type AgentState = "working" | "done" | "blocked" | "waiting" | "idle";

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
  session: SessionRef | null;
  lastMessage: string | null;
  toolName: string | null;
  backgroundRunning: boolean;
  interrupted: boolean;
  stateSince: number | null;
  updatedAt: number | null;
  unread: boolean;
  terminalHandle: string | null;
  artifacts: Artifact[];
  parentId: string | null;
  model: string | null;
  contextPercent: number | null;
  effort: string | null;
  permission: RunnerPermission | null;
  /** Conductor settings, outgoing lines and parent from the runner daemon; null for sessions it does not know. */
  orchestration: SessionOrchestration | null;
  /** Subagents (Task tool) this session has running right now. */
  subagents: SubagentRun[];
}

export interface SubagentRun {
  id: string;
  /** What the parent asked for, e.g. "Code review profile API diff". */
  description: string;
  agentType: string;
  /** The subagent's latest step: a tool call ("Bash · git diff …") or the start of its latest text. */
  activity: string | null;
  updatedAt: number;
}

export interface WorktreeSummary {
  worktreeId: string;
  repo: string;
  name: string;
  branch: string | null;
  path: string;
  projectPath: string;
  isMain: boolean;
  parentWorktreeId: string | null;
  unread: boolean;
  lastActivityAt: number | null;
  flowTasks: FlowTaskSummary[];
  otherFlowTasks: FlowTaskSummary[];
  pullRequest: PullRequestInfo;
  jira: JiraIssueInfo;
  featureId: string | null;
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
  features: FeatureSummary[];
}

export type BoardResponse =
  | { ok: true; board: BoardSnapshot }
  | { ok: false; error: string };
