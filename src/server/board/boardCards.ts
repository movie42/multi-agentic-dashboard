import "server-only";
import path from "node:path";
import type { AgentCard, AgentState, Artifact, WorktreeSummary } from "@/common/board/types";
import type { RunnerSession } from "@/common/runner/types";
import type { SessionBookmark, SessionRef } from "@/common/sessions/types";
import type { FeatureSummary, JiraIssueInfo, PullRequestInfo } from "@/common/workflow/types";
import type { GitWorktree } from "@/server/projects/gitWorktrees";
import type { Project } from "@/server/projects/ProjectRegistry";
import type { WorktreeMetaEntry } from "@/server/projects/WorktreeMeta";
import type { WorktreeFlowTasks } from "@/server/workflow/flowTasks";

export interface BoardWorktree extends GitWorktree {
  project: Project;
  meta: WorktreeMetaEntry;
}

export function worktreeName(worktree: BoardWorktree): string {
  return worktree.meta.displayName ?? worktree.branch ?? path.basename(worktree.path);
}

export function worktreeOfCwd<T extends { path: string }>(cwd: string, worktrees: readonly T[]): T | null {
  return (
    worktrees
      .filter((worktree) => cwd === worktree.path || cwd.startsWith(`${worktree.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0] ?? null
  );
}

export function stateOf(session: RunnerSession): AgentState {
  if (session.status === "working") return "working";
  if (session.status === "waiting") return "blocked";
  return session.prompted ? "done" : "idle";
}

export interface WorktreeSummaryInput {
  worktree: BoardWorktree;
  livePaths: ReadonlySet<string>;
  flow: WorktreeFlowTasks;
  pullRequest: PullRequestInfo;
  jira: JiraIssueInfo;
  lastActivityAt: number | null;
}

export function buildWorktreeSummary({ worktree, livePaths, flow, pullRequest, jira, lastActivityAt }: WorktreeSummaryInput): WorktreeSummary {
  const parent = worktree.meta.parentPath;
  return {
    worktreeId: worktree.path,
    repo: worktree.project.name,
    name: worktreeName(worktree),
    branch: worktree.branch,
    path: worktree.path,
    projectPath: worktree.project.path,
    isMain: worktree.isMain,
    parentWorktreeId: parent && parent !== worktree.path && livePaths.has(parent) ? parent : null,
    unread: false,
    lastActivityAt,
    flowTasks: flow.current,
    otherFlowTasks: flow.other,
    pullRequest,
    jira,
    featureId: null,
  };
}

export interface AgentCardInput {
  session: RunnerSession;
  worktree: BoardWorktree;
  prompt: string | null;
  lastMessage: string | null;
  sessionRef: SessionRef | null;
  bookmarks: ReadonlyMap<string, SessionBookmark>;
  artifacts: Artifact[];
}

export function buildAgentCard({ session, worktree, prompt, lastMessage, sessionRef, bookmarks, artifacts }: AgentCardInput): AgentCard {
  return {
    id: session.id,
    worktreeId: worktree.path,
    repo: worktree.project.name,
    worktreeName: worktreeName(worktree),
    branch: worktree.branch,
    worktreePath: worktree.path,
    agentType: session.kind,
    state: stateOf(session),
    prompt,
    title: null,
    session: sessionRef ? { ...sessionRef, bookmark: bookmarks.get(sessionRef.id) ?? null } : null,
    lastMessage,
    toolName: null,
    backgroundRunning: false,
    interrupted: false,
    stateSince: session.updatedAt,
    updatedAt: session.updatedAt,
    unread: false,
    terminalHandle: session.id,
    artifacts,
    parentId: null,
    model: session.model,
    contextPercent: session.contextPercent,
    permission: session.permission,
  };
}

export function withFeatureRepos(features: FeatureSummary[], repoOfPath: ReadonlyMap<string, string>): FeatureSummary[] {
  return features.map((feature) => {
    const paths = [feature.repoPath, ...feature.rows.map((row) => row.worktree)];
    const repo = paths.map((target) => (target ? repoOfPath.get(target) : undefined)).find(Boolean) ?? null;
    return { ...feature, repo };
  });
}
