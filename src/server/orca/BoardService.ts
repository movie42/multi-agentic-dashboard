import "server-only";
import { extractArtifacts } from "@/server/orca/artifacts";
import type { AgentCard, Artifact, BoardSnapshot, ProjectSummary, WorktreeSummary } from "@/common/orca/types";
import type { PendingPermission } from "@/common/permissions/types";
import type { LocatedSession } from "@/server/sessions/SessionLocator";
import type { SessionBookmark, SessionRef } from "@/common/sessions/types";
import { isMissingPath, type FileSystemPort, type ReportFn } from "@/server/shared/ports";
import { featureOfWorktree } from "@/server/workflow/features";
import { mergeRepoFlowTasks, splitFlowTasks, type WorktreeFlowScan } from "@/server/workflow/flowTasks";
import type { GitInfo } from "@/server/workflow/GitInfo";
import type { JiraInfo } from "@/server/workflow/JiraInfo";
import type { WorkflowServices } from "@/server/workflow/services";
import {
  buildAgentCard,
  buildWorktreeSummary,
  expandPreview,
  repoPaths,
  shortBranch,
  terminalHandles,
  withFeatureRepos,
} from "./boardCards";
import type { OrcaCli } from "./OrcaCli";
import type { OrphanReattacher } from "./OrphanReattacher";
import { terminalListSchema, worktreePsSchema, type OrcaAgentRaw, type OrcaWorktreeRaw } from "./schema";

export interface BoardSessionPort {
  findSession(paneKey: string, cwd: string, preview: string | null, prompt: string | null): Promise<LocatedSession | null>;
  sessionRefOf(file: string, size: number): Promise<SessionRef>;
  readBookmarks(): Promise<Map<string, SessionBookmark>>;
}

export interface BoardPermissionPort {
  settleStale(paneKey: string, stateName: string, stateSince: number | null): void;
  pendingByPane(): Map<string, PendingPermission>;
}

export interface BoardServiceOptions {
  cli: Pick<OrcaCli, "run">;
  orphans: Pick<OrphanReattacher, "reattach">;
  workflow: Pick<WorkflowServices, "flowDocs" | "featureDocs"> & {
    git: Pick<GitInfo, "getPullRequest" | "detectMode">;
    jira: Pick<JiraInfo, "getIssue">;
  };
  sessions: BoardSessionPort;
  permissions: BoardPermissionPort;
  fs: FileSystemPort;
  warn: ReportFn;
  now?: () => number;
}

interface WorktreeContext {
  worktree: OrcaWorktreeRaw;
  bookmarks: ReadonlyMap<string, SessionBookmark>;
  handles: ReadonlyMap<string, string>;
  permissions: ReadonlyMap<string, PendingPermission>;
}

async function mapSequential<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  return items.reduce<Promise<R[]>>(async (acc, item) => [...(await acc), await fn(item)], Promise.resolve([]));
}

export class BoardService {
  private lastBoard: BoardSnapshot | null = null;
  private readonly now: () => number;

  constructor(private readonly options: BoardServiceOptions) {
    this.now = options.now ?? Date.now;
  }

  async load(): Promise<BoardSnapshot> {
    const { cli, workflow, permissions } = this.options;
    const [ps, terminals, bookmarks] = await Promise.all([
      cli.run(["worktree", "ps", "--limit", "500"], worktreePsSchema),
      cli.run(["terminal", "list"], terminalListSchema).catch((error: unknown) => {
        this.options.warn("board", error, { step: "terminal list" });
        return { terminals: [] };
      }),
      this.options.sessions.readBookmarks().catch((error: unknown) => {
        this.options.warn("board", error, { step: "bookmarks" });
        return new Map<string, SessionBookmark>();
      }),
    ]);

    const handles = terminalHandles(terminals.terminals);
    void this.options.orphans.reattach(terminals.terminals);

    ps.worktrees.forEach((worktree) =>
      worktree.agents.forEach((agent) => permissions.settleStale(agent.paneKey, agent.state, agent.stateStartedAt)),
    );
    const pending = permissions.pendingByPane();

    const live = ps.worktrees.filter((worktree) => !worktree.isArchived);
    const liveIds = new Set(live.map((worktree) => worktree.worktreeId));
    const scanned = await Promise.all(
      live.map(async (worktree) => ({ worktree, scan: await workflow.flowDocs.scan(worktree.path, shortBranch(worktree.branch)) })),
    );
    const scans = new Map(scanned.map(({ worktree, scan }) => [worktree.worktreeId, scan]));
    const repoFlowTasks = new Map(
      [...new Set(live.map((worktree) => worktree.repo))].map((repo) => [
        repo,
        mergeRepoFlowTasks(scanned.flatMap(({ worktree, scan }) => (worktree.repo === repo ? [scan] : []))),
      ]),
    );

    const perWorktree = await mapSequential(live, async (worktree) => {
      const branch = shortBranch(worktree.branch);
      const ownScan: WorktreeFlowScan = scans.get(worktree.worktreeId) ?? { branch, tasks: [] };
      const flow = splitFlowTasks(repoFlowTasks.get(worktree.repo) ?? [], ownScan);
      const docsHere = await workflow.featureDocs.docsIn(worktree.path);
      const summary = buildWorktreeSummary({
        worktree,
        liveIds,
        flow,
        pullRequest: workflow.git.getPullRequest(worktree.path, branch),
        jira: workflow.jira.getIssue(branch),
      });
      const agents = await mapSequential(worktree.agents, (agent) =>
        this.agentCard(agent, { worktree, bookmarks, handles, permissions: pending }),
      );
      return {
        summary,
        agents,
        taskFeatureDocs: flow.current.map((task) => task.featureDoc),
        docsHere,
        featureDocs: [...flow.current, ...flow.other]
          .map((task) => task.featureDoc)
          .filter((doc): doc is string => Boolean(doc))
          .concat(docsHere),
      };
    });

    const projects: ProjectSummary[] = await Promise.all(
      [...repoPaths(live).entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(async ([repo, repoPath]) => ({ repo, autoMode: await workflow.git.detectMode(repoPath) })),
    );

    const repoOfPath = new Map(live.map((worktree) => [worktree.path, worktree.repo]));
    const features = withFeatureRepos(
      await workflow.featureDocs.load(new Set(perWorktree.flatMap((entry) => entry.featureDocs))),
      repoOfPath,
    );
    const worktrees: WorktreeSummary[] = perWorktree.map(({ summary, taskFeatureDocs, docsHere }) => ({
      ...summary,
      featureId:
        featureOfWorktree(features, summary.repo, summary.path, summary.branch, taskFeatureDocs, docsHere)?.id ?? null,
    }));
    const agents: AgentCard[] = perWorktree.flatMap((entry) => entry.agents);

    const board: BoardSnapshot = { fetchedAt: this.now(), projects, worktrees, agents, features };
    this.lastBoard = board;
    return board;
  }

  async worktreePaths(options: { fresh?: boolean } = {}): Promise<string[]> {
    const board = !options.fresh && this.lastBoard ? this.lastBoard : await this.load();
    return board.worktrees.map((worktree) => worktree.path);
  }

  private async agentCard(agent: OrcaAgentRaw, context: WorktreeContext): Promise<AgentCard> {
    const { lastMessage, session } = await this.sessionOf(agent, context.worktree.path);
    return buildAgentCard({
      agent,
      worktree: context.worktree,
      lastMessage,
      session,
      bookmarks: context.bookmarks,
      terminalHandle: context.handles.get(agent.paneKey) ?? null,
      artifacts: await this.existing(extractArtifacts(lastMessage, context.worktree.path)),
      permission: context.permissions.get(agent.paneKey) ?? null,
    });
  }

  private async sessionOf(
    agent: OrcaAgentRaw,
    cwd: string,
  ): Promise<{ lastMessage: string | null; session: SessionRef | null }> {
    const message = agent.lastAssistantMessage;
    if (agent.agentType !== "claude") return { lastMessage: message, session: null };
    const { sessions, warn } = this.options;
    const located = await sessions.findSession(agent.paneKey, cwd, message, agent.prompt).catch((error: unknown) => {
      warn("board", error, { step: "find session", paneKey: agent.paneKey });
      return null;
    });
    if (!located) return { lastMessage: message, session: null };
    const session = await sessions.sessionRefOf(located.file, located.size).catch((error: unknown) => {
      warn("board", error, { step: "session title", file: located.file });
      return null;
    });
    return { lastMessage: expandPreview(message, located.lastAssistant), session };
  }

  private async existing(artifacts: Artifact[]): Promise<Artifact[]> {
    const checks = await Promise.all(
      artifacts.map(async (artifact) => {
        if (artifact.kind === "artifact" || artifact.kind === "pr") return true;
        if (artifact.target.includes("*")) return false;
        return this.options.fs.stat(artifact.target).then(
          (info) => info.isFile(),
          (error: unknown) => {
            if (!isMissingPath(error)) this.options.warn("board", error, { step: "artifact", target: artifact.target });
            return false;
          },
        );
      }),
    );
    return artifacts.filter((_, index) => checks[index]);
  }
}
