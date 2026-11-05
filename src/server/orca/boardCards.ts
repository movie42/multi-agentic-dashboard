import "server-only";
import type { AgentCard, AgentState, Artifact, BoardSnapshot, WorktreeSummary } from "@/common/orca/types";
import type { PendingPermission } from "@/common/permissions/types";
import type { SessionBookmark, SessionRef } from "@/common/sessions/types";
import type { FeatureSummary, PullRequestInfo } from "@/common/workflow/types";
import type { CheckInput } from "@/server/workflow/featureCheck";
import type { WorktreeFlowTasks } from "@/server/workflow/flowTasks";
import type { OrcaAgentRaw, OrcaTerminalRaw, OrcaWorktreeRaw } from "./schema";

const PREVIEW_LIMIT = 200;
export type FeatureCheckInputSource = Pick<BoardSnapshot, "features" | "worktrees">;

const KNOWN_STATES: readonly AgentState[] = ["working", "done", "blocked", "waiting", "idle"];

export function isPreview(message: string | null): message is string {
  return message !== null && !message.includes("\n") && message.length <= PREVIEW_LIMIT;
}

export function expandPreview(message: string | null, full: string | null): string | null {
  const expands =
    isPreview(message) &&
    full !== null &&
    full.replace(/\s+/g, " ").startsWith(message.replace(/\s+/g, " ").trim().slice(0, 60));
  return expands ? full : message;
}

export function toAgentState(value: string): AgentState {
  return KNOWN_STATES.find((state) => state === value) ?? "idle";
}

export function shortBranch(branch: string | null): string | null {
  return branch ? branch.replace(/^refs\/heads\//, "") : null;
}

export function terminalHandles(terminals: OrcaTerminalRaw[]): Map<string, string> {
  const byLeaf = terminals.map((terminal): [string, string] => [`${terminal.tabId}:${terminal.leafId}`, terminal.handle]);
  const leafKeys = new Set(byLeaf.map(([key]) => key));
  const byRecorded = terminals
    .flatMap((terminal): [string, string][] =>
      terminal.recordedPaneKey ? [[terminal.recordedPaneKey, terminal.handle]] : [],
    )
    .filter(([key], index, all) => !leafKeys.has(key) && all.findIndex(([other]) => other === key) === index);
  return new Map([...byLeaf, ...byRecorded]);
}

export function repoPaths(worktrees: OrcaWorktreeRaw[]): Map<string, string> {
  return worktrees.reduce(
    (acc, worktree) =>
      !acc.has(worktree.repo) || worktree.isMainWorktree ? acc.set(worktree.repo, worktree.path) : acc,
    new Map<string, string>(),
  );
}

export function worktreeName(worktree: OrcaWorktreeRaw): string {
  return worktree.displayName ?? shortBranch(worktree.branch) ?? worktree.path;
}

export interface EffectiveAgent {
  backgroundRunning: boolean;
  state: AgentState;
  since: number | null;
}

export function effectiveAgent(agent: OrcaAgentRaw): EffectiveAgent {
  const main = agent.mainAgent;
  const backgroundRunning = agent.workingMode === "monitoring" && main != null && main.state !== "working";
  return backgroundRunning && main
    ? { backgroundRunning, state: toAgentState(main.state), since: main.stateStartedAt }
    : { backgroundRunning, state: toAgentState(agent.state), since: agent.stateStartedAt };
}

export interface WorktreeSummaryInput {
  worktree: OrcaWorktreeRaw;
  liveIds: ReadonlySet<string>;
  flow: WorktreeFlowTasks;
  pullRequest: PullRequestInfo;
}

export function buildWorktreeSummary({ worktree, liveIds, flow, pullRequest }: WorktreeSummaryInput): WorktreeSummary {
  return {
    worktreeId: worktree.worktreeId,
    repo: worktree.repo,
    name: worktreeName(worktree),
    branch: shortBranch(worktree.branch),
    path: worktree.path,
    parentWorktreeId:
      worktree.parentWorktreeId && liveIds.has(worktree.parentWorktreeId) ? worktree.parentWorktreeId : null,
    unread: worktree.unread,
    lastActivityAt: worktree.lastActivityAt,
    flowTasks: flow.current,
    otherFlowTasks: flow.other,
    pullRequest,
    featureId: null,
  };
}

export interface AgentCardInput {
  agent: OrcaAgentRaw;
  worktree: OrcaWorktreeRaw;
  lastMessage: string | null;
  session: SessionRef | null;
  bookmarks: ReadonlyMap<string, SessionBookmark>;
  terminalHandle: string | null;
  artifacts: Artifact[];
  permission: PendingPermission | null;
}

export function buildAgentCard(input: AgentCardInput): AgentCard {
  const { agent, worktree, lastMessage, session } = input;
  const effective = effectiveAgent(agent);
  return {
    id: agent.paneKey,
    worktreeId: worktree.worktreeId,
    repo: worktree.repo,
    worktreeName: worktreeName(worktree),
    branch: shortBranch(worktree.branch),
    worktreePath: worktree.path,
    agentType: agent.agentType,
    state: effective.state,
    prompt: agent.prompt,
    title: agent.taskTitle ?? agent.displayName,
    session: session ? { ...session, bookmark: input.bookmarks.get(session.id) ?? null } : null,
    lastMessage,
    toolName: agent.toolName,
    backgroundRunning: effective.backgroundRunning,
    interrupted: agent.interrupted,
    stateSince: effective.since,
    updatedAt: agent.updatedAt,
    unread: worktree.unread,
    terminalHandle: input.terminalHandle,
    artifacts: input.artifacts,
    permission: input.permission,
    parentId: agent.parentPaneKey ?? null,
  };
}

export function withFeatureRepos(features: FeatureSummary[], repoOfPath: ReadonlyMap<string, string>): FeatureSummary[] {
  return features.map((feature) => {
    const paths = [feature.repoPath, ...feature.rows.map((row) => row.worktree)];
    const repo = paths.map((target) => (target ? repoOfPath.get(target) : undefined)).find(Boolean) ?? null;
    return { ...feature, repo };
  });
}

export function featureCheckInputOf(board: FeatureCheckInputSource, featureId: string): CheckInput {
  const feature = board.features.find((entry) => entry.id === featureId);
  if (!feature) throw new Error("기능 문서를 찾지 못했어요");
  if (!feature.root) throw new Error("기능 문서에 루트 브랜치(root)가 없어요");
  const toCheck = (worktree: WorktreeSummary) => ({ path: worktree.path, name: worktree.name, branch: worktree.branch });
  const repoWorktrees = board.worktrees.filter((worktree) => worktree.repo === feature.repo).map(toCheck);
  const featureWorktrees = board.worktrees.filter((worktree) => worktree.featureId === featureId).map(toCheck);
  const repoPath = feature.repoPath ?? featureWorktrees[0]?.path;
  if (!repoPath) throw new Error("기능의 워크트리를 찾지 못했어요");
  return { featureId, root: feature.root, repoPath, featureWorktrees, repoWorktrees };
}

