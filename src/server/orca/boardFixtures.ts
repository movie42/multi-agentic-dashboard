import "server-only";
import type { OrcaAgentRaw, OrcaWorktreeRaw } from "./schema";

export function rawAgent(overrides: Partial<OrcaAgentRaw> = {}): OrcaAgentRaw {
  return {
    paneKey: "tab:leaf",
    parentPaneKey: null,
    state: "working",
    agentType: "claude",
    prompt: "do it",
    taskTitle: null,
    displayName: "Claude",
    lastAssistantMessage: null,
    toolName: null,
    workingMode: null,
    interrupted: false,
    stateStartedAt: 10,
    updatedAt: 20,
    ...overrides,
  };
}

export function rawWorktree(overrides: Partial<OrcaWorktreeRaw> = {}): OrcaWorktreeRaw {
  return {
    worktreeId: "wt-1",
    repoId: "r",
    repo: "repo",
    path: "/w",
    branch: "refs/heads/feat/x",
    displayName: null,
    isArchived: false,
    isMainWorktree: false,
    isPinned: false,
    parentWorktreeId: null,
    unread: false,
    status: "active",
    lastActivityAt: 5,
    lastOutputAt: null,
    agents: [],
    ...overrides,
  };
}
