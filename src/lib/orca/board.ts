import { stat } from "node:fs/promises";
import { extractArtifacts } from "./artifacts";
import { featureDocsIn, featureOfWorktree, loadFeatures } from "@/lib/workflow/featureDocs";
import { mergeRepoFlowTasks, scanFlowTasks, splitFlowTasks, type WorktreeFlowScan } from "@/lib/workflow/flowDocs";
import type { CheckInput } from "@/lib/workflow/remoteCheck";
import { detectMode, getPullRequest } from "@/lib/workflow/git";
import { readBookmarks } from "@/lib/sessions/bookmarks";
import { findSession } from "@/lib/sessions/fullMessage";
import { sessionRefOf } from "@/lib/sessions/sessionTitle";
import type { SessionBookmark, SessionRef } from "@/lib/sessions/types";
import { pendingByPane, settleStale } from "@/lib/permissions/store";
import { runOrca } from "./cli";
import { reattachOrphans } from "./orphans";
import type {
  AgentCard,
  Artifact,
  AgentState,
  BoardSnapshot,
  ProjectSummary,
  WorktreeSummary,
  OrcaTerminalRaw,
  OrcaWorktreeRaw,
} from "./types";

const PREVIEW_LIMIT = 200;

function isPreview(message: string | null): message is string {
  return message !== null && !message.includes("\n") && message.length <= PREVIEW_LIMIT;
}

async function sessionOf(
  agent: OrcaWorktreeRaw["agents"][number],
  cwd: string,
): Promise<{ lastMessage: string | null; session: SessionRef | null }> {
  const message = agent.lastAssistantMessage;
  if (agent.agentType !== "claude") return { lastMessage: message, session: null };
  const located = await findSession(agent.paneKey, cwd, message, agent.prompt).catch(() => null);
  if (!located) return { lastMessage: message, session: null };
  const full = located.lastAssistant;
  const expands = isPreview(message) && full !== null && full.replace(/\s+/g, " ").startsWith(message.replace(/\s+/g, " ").trim().slice(0, 60));
  const session = await sessionRefOf(located.file, located.size).catch(() => null);
  return { lastMessage: expands ? full : message, session };
}

const KNOWN_STATES: readonly AgentState[] = ["working", "done", "blocked", "waiting", "idle"];

function toAgentState(value: string): AgentState {
  return KNOWN_STATES.find((state) => state === value) ?? "idle";
}

async function existing(artifacts: Artifact[]): Promise<Artifact[]> {
  const checks = await Promise.all(
    artifacts.map(async (artifact) => {
      if (artifact.kind === "artifact" || artifact.kind === "pr") return true;
      if (artifact.target.includes("*")) return false;
      return stat(artifact.target)
        .then((info) => info.isFile())
        .catch(() => false);
    }),
  );
  return artifacts.filter((_, index) => checks[index]);
}

function shortBranch(branch: string | null): string | null {
  return branch ? branch.replace(/^refs\/heads\//, "") : null;
}

export async function loadBoard(): Promise<BoardSnapshot> {
  const [ps, terminals, bookmarks] = await Promise.all([
    runOrca<{ worktrees: OrcaWorktreeRaw[] }>(["worktree", "ps", "--limit", "500"]),
    runOrca<{ terminals: OrcaTerminalRaw[] }>(["terminal", "list"]).catch(() => ({
      terminals: [],
    })),
    readBookmarks().catch((error: unknown) => {
      console.warn("[board] bookmarks", error);
      return new Map<string, SessionBookmark>();
    }),
  ]);

  const handleByPane = new Map<string, string>();
  for (const terminal of terminals.terminals) {
    handleByPane.set(`${terminal.tabId}:${terminal.leafId}`, terminal.handle);
    if (terminal.recordedPaneKey && !handleByPane.has(terminal.recordedPaneKey)) {
      handleByPane.set(terminal.recordedPaneKey, terminal.handle);
    }
  }
  reattachOrphans(terminals.terminals);

  for (const worktree of ps.worktrees) {
    for (const agent of worktree.agents) settleStale(agent.paneKey, agent.state, agent.stateStartedAt);
  }
  const permissions = pendingByPane();

  const agents: AgentCard[] = [];
  const worktrees: WorktreeSummary[] = [];
  const repoPaths = new Map<string, string>();
  const repoOfPath = new Map<string, string>();
  const featureDocs = new Set<string>();
  const taskFeatureDocs = new Map<string, (string | null)[]>();

  const live = ps.worktrees.filter((worktree) => !worktree.isArchived);
  const liveIds = new Set(live.map((worktree) => worktree.worktreeId));
  const scans = new Map<string, WorktreeFlowScan>();
  const scansByRepo = new Map<string, WorktreeFlowScan[]>();
  for (const worktree of live) {
    const scan = await scanFlowTasks(worktree.path, shortBranch(worktree.branch));
    scans.set(worktree.worktreeId, scan);
    scansByRepo.set(worktree.repo, [...(scansByRepo.get(worktree.repo) ?? []), scan]);
  }
  const repoFlowTasks = new Map(
    [...scansByRepo.entries()].map(([repo, repoScans]) => [repo, mergeRepoFlowTasks(repoScans)]),
  );

  for (const worktree of live) {
    const branch = shortBranch(worktree.branch);
    if (!repoPaths.has(worktree.repo) || worktree.isMainWorktree) {
      repoPaths.set(worktree.repo, worktree.path);
    }
    const ownScan = scans.get(worktree.worktreeId) ?? { branch, tasks: [] };
    const flow = splitFlowTasks(repoFlowTasks.get(worktree.repo) ?? [], ownScan);
    repoOfPath.set(worktree.path, worktree.repo);
    const pointers = [...flow.current, ...flow.other].map((task) => task.featureDoc);
    taskFeatureDocs.set(worktree.worktreeId, flow.current.map((task) => task.featureDoc));
    for (const doc of pointers) if (doc) featureDocs.add(doc);
    for (const doc of await featureDocsIn(worktree.path)) featureDocs.add(doc);
    worktrees.push({
      worktreeId: worktree.worktreeId,
      repo: worktree.repo,
      name: worktree.displayName ?? branch ?? worktree.path,
      branch,
      path: worktree.path,
      parentWorktreeId:
        worktree.parentWorktreeId && liveIds.has(worktree.parentWorktreeId) ? worktree.parentWorktreeId : null,
      unread: worktree.unread,
      lastActivityAt: worktree.lastActivityAt,
      flowTasks: flow.current,
      otherFlowTasks: flow.other,
      pullRequest: getPullRequest(worktree.path, branch),
      featureId: null,
    });
    for (const agent of worktree.agents) {
      const backgroundRunning =
        agent.workingMode === "monitoring" && agent.mainAgent != null && agent.mainAgent.state !== "working";
      const effectiveState = backgroundRunning && agent.mainAgent ? agent.mainAgent.state : agent.state;
      const { lastMessage, session } = await sessionOf(agent, worktree.path);
      const effectiveSince =
        backgroundRunning && agent.mainAgent ? agent.mainAgent.stateStartedAt : agent.stateStartedAt;
      agents.push({
        id: agent.paneKey,
        worktreeId: worktree.worktreeId,
        repo: worktree.repo,
        worktreeName: worktree.displayName ?? branch ?? worktree.path,
        branch,
        worktreePath: worktree.path,
        agentType: agent.agentType,
        state: toAgentState(effectiveState),
        prompt: agent.prompt,
        title: agent.taskTitle ?? agent.displayName,
        session: session ? { ...session, bookmark: bookmarks.get(session.id) ?? null } : null,
        lastMessage,
        toolName: agent.toolName,
        backgroundRunning,
        interrupted: agent.interrupted,
        stateSince: effectiveSince,
        updatedAt: agent.updatedAt,
        unread: worktree.unread,
        terminalHandle: handleByPane.get(agent.paneKey) ?? null,
        artifacts: await existing(extractArtifacts(lastMessage, worktree.path)),
        permission: permissions.get(agent.paneKey) ?? null,
        parentId: agent.parentPaneKey ?? null,
      });
    }
  }

  const projects: ProjectSummary[] = await Promise.all(
    [...repoPaths.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(async ([repo, repoPath]) => ({ repo, autoMode: await detectMode(repoPath) })),
  );

  const features = await loadFeatures(featureDocs);
  for (const feature of features) {
    const paths = [feature.repoPath, ...feature.rows.map((row) => row.worktree)];
    feature.repo = paths.map((target) => (target ? repoOfPath.get(target) : undefined)).find(Boolean) ?? null;
  }
  for (const worktree of worktrees) {
    worktree.featureId =
      featureOfWorktree(features, worktree.repo, worktree.path, worktree.branch, taskFeatureDocs.get(worktree.worktreeId) ?? [])
        ?.id ?? null;
  }

  const board = { fetchedAt: Date.now(), projects, worktrees, agents, features };
  lastBoard = board;
  return board;
}

let lastBoard: BoardSnapshot | null = null;

export async function featureCheckInput(featureId: string): Promise<CheckInput> {
  const board = lastBoard ?? (await loadBoard());
  const feature = board.features.find((entry) => entry.id === featureId);
  if (!feature) throw new Error("기능 문서를 찾지 못했어요");
  if (!feature.root) throw new Error("기능 문서에 루트 브랜치(root)가 없어요");
  const repoWorktrees = board.worktrees
    .filter((worktree) => worktree.repo === feature.repo)
    .map((worktree) => ({ path: worktree.path, name: worktree.name, branch: worktree.branch }));
  const featureWorktrees = board.worktrees
    .filter((worktree) => worktree.featureId === featureId)
    .map((worktree) => ({ path: worktree.path, name: worktree.name, branch: worktree.branch }));
  const repoPath = feature.repoPath ?? featureWorktrees[0]?.path;
  if (!repoPath) throw new Error("기능의 워크트리를 찾지 못했어요");
  return { featureId, root: feature.root, repoPath, featureWorktrees, repoWorktrees };
}
