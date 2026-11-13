import "server-only";
import type { AgentCard, Artifact, BoardSnapshot, ProjectSummary, WorktreeSummary } from "@/common/board/types";
import type { RunnerSession } from "@/common/runner/types";
import type { SessionBookmark, SessionRef } from "@/common/sessions/types";
import type { WorkflowMode } from "@/common/workflow/types";
import type { GitWorktree } from "@/server/projects/gitWorktrees";
import type { Project } from "@/server/projects/ProjectRegistry";
import type { WorktreeMetaEntry } from "@/server/projects/WorktreeMeta";
import type { TranscriptFacts } from "@/server/sessions/SessionTranscripts";
import { isMissingPath, type FileSystemPort, type ReportFn } from "@/server/shared/ports";
import { featureOfWorktree } from "@/server/workflow/features";
import { mergeRepoFlowTasks, splitFlowTasks, type WorktreeFlowScan } from "@/server/workflow/flowTasks";
import type { GitInfo } from "@/server/workflow/GitInfo";
import type { JiraInfo } from "@/server/workflow/JiraInfo";
import { issueKeyOfBranch } from "@/server/workflow/JiraInfo";
import type { WorkflowServices } from "@/server/workflow/services";
import { extractArtifacts } from "./artifacts";
import { buildAgentCard, buildWorktreeSummary, withFeatureRepos, worktreeOfCwd, type BoardWorktree } from "./boardCards";

export interface BoardSessionPort {
  transcriptOf(cwd: string, sessionId: string): Promise<TranscriptFacts | null>;
  sessionRefOf(file: string, size: number): Promise<SessionRef>;
  readBookmarks(): Promise<Map<string, SessionBookmark>>;
}

export interface BoardServiceOptions {
  prepare: () => Promise<void>;
  projects: () => Promise<Project[]>;
  worktreesOf: (project: Project) => Promise<GitWorktree[]>;
  meta: () => Promise<ReadonlyMap<string, WorktreeMetaEntry>>;
  runnerSessions: () => Promise<RunnerSession[]>;
  workflow: Pick<WorkflowServices, "flowDocs" | "featureDocs"> & {
    git: Pick<GitInfo, "getPullRequest" | "detectMode">;
    jira: Pick<JiraInfo, "getIssue">;
  };
  sessions: BoardSessionPort;
  fs: FileSystemPort;
  warn: ReportFn;
  now?: () => number;
}

const FALLBACK_MODE: WorkflowMode = "personal";

async function mapSequential<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  return items.reduce<Promise<R[]>>(async (acc, item) => [...(await acc), await fn(item)], Promise.resolve([]));
}

function uniqueByPath(worktrees: BoardWorktree[]): BoardWorktree[] {
  return worktrees.filter((worktree, index) => worktrees.findIndex((other) => other.path === worktree.path) === index);
}

export class BoardService {
  private lastBoard: BoardSnapshot | null = null;
  private readonly now: () => number;

  constructor(private readonly options: BoardServiceOptions) {
    this.now = options.now ?? Date.now;
  }

  async load(): Promise<BoardSnapshot> {
    const { workflow, warn } = this.options;
    await this.options.prepare();
    const [registered, meta, runnerSessions, bookmarks] = await Promise.all([
      this.options.projects(),
      this.options.meta(),
      this.options.runnerSessions().catch((error: unknown) => {
        warn("board", error, { step: "runner sessions" });
        return [];
      }),
      this.options.sessions.readBookmarks().catch((error: unknown) => {
        warn("board", error, { step: "bookmarks" });
        return new Map<string, SessionBookmark>();
      }),
    ]);

    const live = uniqueByPath(
      (
        await Promise.all(
          registered.map(async (project) =>
            (await this.options.worktreesOf(project)).map((worktree): BoardWorktree => ({ ...worktree, project, meta: meta.get(worktree.path) ?? {} })),
          ),
        )
      ).flat(),
    );
    const livePaths = new Set(live.map((worktree) => worktree.path));
    const running = runnerSessions.filter((session) => session.status !== "exited");
    const sessionsOf = (worktree: BoardWorktree) => running.filter((session) => worktreeOfCwd(session.cwd, live) === worktree);

    const scanned = await Promise.all(
      live.map(async (worktree) => ({ worktree, scan: await workflow.flowDocs.scan(worktree.path, worktree.branch) })),
    );
    const scans = new Map(scanned.map(({ worktree, scan }) => [worktree.path, scan]));
    const repoFlowTasks = new Map(
      registered.map((project) => [
        project.name,
        mergeRepoFlowTasks(scanned.flatMap(({ worktree, scan }) => (worktree.project.name === project.name ? [scan] : []))),
      ]),
    );

    const perWorktree = await mapSequential(live, async (worktree) => {
      const ownScan: WorktreeFlowScan = scans.get(worktree.path) ?? { branch: worktree.branch, tasks: [] };
      const flow = splitFlowTasks(repoFlowTasks.get(worktree.project.name) ?? [], ownScan);
      const docsHere = await workflow.featureDocs.docsIn(worktree.path);
      const own = sessionsOf(worktree);
      const summary = buildWorktreeSummary({
        worktree,
        livePaths,
        flow,
        pullRequest: workflow.git.getPullRequest(worktree.path, worktree.branch),
        jira: workflow.jira.getIssue(issueKeyOfBranch(worktree.branch) ? worktree.branch : (worktree.meta.reference ?? null)),
        lastActivityAt: own.length > 0 ? Math.max(...own.map((session) => session.updatedAt)) : null,
      });
      const agents = await mapSequential(
        [...own].sort((a, b) => a.startedAt - b.startedAt),
        (session) => this.agentCard(session, worktree, bookmarks),
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
      [...registered]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (project) => ({
          repo: project.name,
          autoMode: await workflow.git.detectMode(project.path).catch((error: unknown) => {
            warn("board", error, { step: "detect mode", project: project.path });
            return FALLBACK_MODE;
          }),
        })),
    );

    const repoOfPath = new Map(live.map((worktree) => [worktree.path, worktree.project.name]));
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

  private async agentCard(
    session: RunnerSession,
    worktree: BoardWorktree,
    bookmarks: ReadonlyMap<string, SessionBookmark>,
  ): Promise<AgentCard> {
    const { sessions, warn } = this.options;
    const facts =
      session.kind === "claude"
        ? await sessions.transcriptOf(session.cwd, session.id).catch((error: unknown) => {
            warn("board", error, { step: "transcript", sessionId: session.id });
            return null;
          })
        : null;
    const sessionRef = facts
      ? await sessions.sessionRefOf(facts.file, facts.size).catch((error: unknown) => {
          warn("board", error, { step: "session title", file: facts.file });
          return null;
        })
      : null;
    const lastMessage = facts?.lastAssistant ?? null;
    return buildAgentCard({
      session,
      worktree,
      prompt: facts?.firstPrompt ?? null,
      lastMessage,
      sessionRef,
      bookmarks,
      artifacts: await this.existing(extractArtifacts(lastMessage, worktree.path)),
    });
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
