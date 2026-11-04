import type { AgentCard } from "@/lib/orca/types";
import type { FlowTaskSummary } from "@/lib/workflow/types";

export function agentCard(overrides: Partial<AgentCard> = {}): AgentCard {
  return {
    id: "pane-1",
    worktreeId: "wt-1",
    repo: "repo",
    worktreeName: "wt",
    branch: "feat/x",
    worktreePath: "/tmp/wt",
    agentType: "claude",
    state: "idle",
    prompt: null,
    title: null,
    session: null,
    lastMessage: null,
    toolName: null,
    backgroundRunning: false,
    interrupted: false,
    stateSince: null,
    updatedAt: null,
    unread: false,
    terminalHandle: null,
    artifacts: [],
    permission: null,
    parentId: null,
    ...overrides,
  };
}

export function flowTask(overrides: Partial<FlowTaskSummary> = {}): FlowTaskSummary {
  return {
    taskId: "task",
    title: "Task",
    domain: "domain",
    branch: null,
    pageIndex: null,
    prdExists: false,
    grill: null,
    plan: null,
    screen: null,
    tasks: null,
    verify: null,
    featureDoc: null,
    updatedAt: 0,
    ...overrides,
  };
}
