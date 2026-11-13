import "server-only";
import type { AskRunner } from "./intentDiff/AskRunner";
import type { AskStore } from "./intentDiff/AskStore";
import { createIntentDiffServices } from "./intentDiff/createServices";

type IntentDiffServices = ReturnType<typeof createIntentDiffServices>;
import { BoardService } from "./board/BoardService";
import { listWorktrees } from "./projects/gitWorktrees";
import { OrcaImport } from "./projects/importFromOrca";
import { ORCA_BIN, PROJECTS_FILE, WORKTREE_META_FILE } from "./projects/paths";
import { ProjectRegistry, type Project } from "./projects/ProjectRegistry";
import { WorktreeActions } from "./projects/WorktreeActions";
import { WorktreeMeta } from "./projects/WorktreeMeta";
import { RunnerClient } from "./runner/RunnerClient";
import { RUNNER_BASE_URL, spawnDaemon } from "./runner/spawnDaemon";
import { createVoice, type VoiceIntent, type VoiceTerminal, type VoiceToggleResult } from "./runner/voice";
import { CLAUDE_SETTINGS_FILE, readVoiceMode } from "./runner/voiceMode";
import { SessionTranscripts } from "./sessions/SessionTranscripts";
import { nodeExecFile, nodeFileSystem } from "./shared/ports";
import type { Highlighter } from "./intentDiff/Highlighter";
import type { LanguageServices } from "./intentDiff/LanguageServices";
import type { SnapshotLog } from "./intentDiff/SnapshotLog";
import type { TranscriptLoader } from "./intentDiff/TranscriptLoader";
import type { ActivityStep, ConversationTurn } from "@/common/sessions/types";
import { CHAT_LIMIT, chatItemsOf, STEP_LIMIT, stepsOf } from "./sessions/activitySteps";
import { TURN_LIMIT, turnsOf } from "./sessions/conversationTurns";
import { TranscriptTailReader } from "./sessions/TranscriptTailReader";
import { BookmarkStore } from "./sessions/BookmarkStore";
import { BOOKMARK_FILE, projectDirOf, PROJECTS_DIR, SESSION_CACHE_FILE } from "./sessions/paths";
import { SessionIndex } from "./sessions/SessionIndex";
import { SessionTitles } from "./sessions/SessionTitles";
import { DocServer } from "./docs/DocServer";
import { FlowAnswerStore } from "./docs/FlowAnswerStore";
import { ErrorLog } from "./shared/errorLog";
import { TODO_FILE } from "./todos/paths";
import { TodoAgent } from "./todos/TodoAgent";
import { TodoLaunchAttacher } from "./todos/TodoLaunchAttacher";
import { TodoStore } from "./todos/TodoStore";
import { UsageReader } from "./usage/UsageReader";
import { readCommit, readCommitDiff } from "./gitGraph/readCommit";
import { GRAPH_PAGE, readGraph } from "./gitGraph/readGraph";
import { MergedReader } from "./gitGraph/readMerged";
import { switchBranch } from "./gitGraph/switchBranch";
import { readWorkingDiff, readWorkingTree } from "./gitGraph/readWorkingTree";
import { createWorkflowServices, type WorkflowServices } from "./workflow/services";
import { createWorktreeWizardServices, type WorktreeWizardServices } from "./worktreeWizard/services";

export interface Services {
  errorLog: ErrorLog;
  sessionIndex: SessionIndex;
  sessionTitles: SessionTitles;
  activity: TranscriptTailReader<ActivityStep>;
  chat: TranscriptTailReader<ActivityStep>;
  conversation: TranscriptTailReader<ConversationTurn>;
  bookmarks: BookmarkStore;
  askStore: AskStore;
  askRunner: AskRunner;
  snapshotLog: SnapshotLog;
  transcriptLoader: TranscriptLoader;
  languageServices: LanguageServices;
  highlighter: Highlighter;
  buildIntentDiff: IntentDiffServices["buildIntentDiff"];
  lookupSymbol: IntentDiffServices["lookupSymbol"];
  isWorktree: IntentDiffServices["isWorktree"];
  concludeAsk: IntentDiffServices["concludeAsk"];
  workflow: WorkflowServices;
  board: BoardService;
  runner: RunnerClient;
  voice: {
    toggle: (terminalHandle: string, intent?: VoiceIntent) => Promise<VoiceToggleResult>;
    read: (terminalHandle: string) => Promise<{ recording: boolean; transcript: string }>;
  };
  projects: ProjectRegistry;
  worktreeMeta: WorktreeMeta;
  worktrees: WorktreeActions;
  worktreeWizard: WorktreeWizardServices;
  todos: TodoStore;
  todoLaunches: TodoLaunchAttacher;
  todoAgent: TodoAgent;
  usage: UsageReader;
  docs: DocServer;
  flowAnswers: FlowAnswerStore;
  gitGraph: {
    readGraph: (worktreePath: string, skip: number) => ReturnType<typeof readGraph>;
    readCommit: typeof readCommit;
    readCommitDiff: typeof readCommitDiff;
    switchBranch: typeof switchBranch;
    readWorkingTree: typeof readWorkingTree;
    readWorkingDiff: typeof readWorkingDiff;
  };
}

function graphReader(merged: MergedReader) {
  return (worktreePath: string, skip: number) => readGraph(worktreePath, skip, GRAPH_PAGE, (path) => merged.read(path));
}

function createServices(): Services {
  const errorLog = new ErrorLog();
  const warn = (scope: string, error: unknown, context?: Record<string, unknown>) => errorLog.record("warn", scope, error, context);
  const reporters = {
    warn,
    error: (scope: string, error: unknown, context?: Record<string, unknown>) => errorLog.record("error", scope, error, context),
  };
  const workflow = createWorkflowServices(reporters);
  const sessionTitles = new SessionTitles(PROJECTS_DIR);
  const bookmarks = new BookmarkStore(BOOKMARK_FILE, warn);
  const todos = new TodoStore(TODO_FILE, warn);
  const intentDiff = createIntentDiffServices({ projectDirOf: (cwd) => projectDirOf(PROJECTS_DIR, cwd), warn });
  const sessionIndex = new SessionIndex({
    projectsDir: PROJECTS_DIR,
    cacheFile: SESSION_CACHE_FILE,
    askSessionIds: () => intentDiff.askStore.sessionIds(),
    warn,
  });
  const transcriptOf = (sessionId: string) => sessionTitles.cachedTranscriptOf(sessionId);
  const runner = new RunnerClient({ baseUrl: RUNNER_BASE_URL, fetch: (input, init) => fetch(input, init), start: spawnDaemon });
  const voiceTerminal: VoiceTerminal = {
    screen: (handle) => runner.screen(handle),
    type: (handle, text) => runner.input(handle, { text, raw: true }),
  };
  const projects = new ProjectRegistry(PROJECTS_FILE, warn);
  const worktreeMeta = new WorktreeMeta(WORKTREE_META_FILE, warn);
  const orcaImport = new OrcaImport({ bin: ORCA_BIN, execFile: nodeExecFile, projects, meta: worktreeMeta, warn });
  const sessionTranscripts = new SessionTranscripts(PROJECTS_DIR, warn);
  const worktreesOf = (project: Project) => listWorktrees(nodeExecFile, project, warn);
  const worktrees = new WorktreeActions({
    execFile: nodeExecFile,
    projects: () => projects.list(),
    worktreesOf,
    meta: worktreeMeta,
    runner,
    warn,
  });
  const board = new BoardService({
    prepare: () => orcaImport.once(),
    projects: () => projects.list(),
    worktreesOf,
    meta: () => worktreeMeta.read(),
    runnerSessions: () => runner.list(),
    workflow,
    sessions: {
      transcriptOf: (cwd, sessionId) => sessionTranscripts.read(cwd, sessionId),
      sessionRefOf: (file, size) => sessionTitles.refOf(file, size),
      readBookmarks: () => bookmarks.read(),
    },
    fs: nodeFileSystem,
    warn,
  });
  const docs = new DocServer({ worktreePaths: (options) => board.worktreePaths(options) });
  return {
    errorLog,
    sessionIndex,
    sessionTitles,
    activity: new TranscriptTailReader(transcriptOf, { parse: stepsOf, enough: STEP_LIMIT }),
    chat: new TranscriptTailReader(transcriptOf, { parse: chatItemsOf, enough: CHAT_LIMIT }),
    conversation: new TranscriptTailReader(transcriptOf, { parse: turnsOf, enough: TURN_LIMIT }),
    bookmarks,
    ...intentDiff,
    workflow,
    board,
    runner,
    voice: createVoice(voiceTerminal, { mode: () => readVoiceMode(CLAUDE_SETTINGS_FILE) }),
    projects,
    worktreeMeta,
    worktrees,
    worktreeWizard: createWorktreeWizardServices(),
    todos,
    todoLaunches: new TodoLaunchAttacher(todos),
    todoAgent: new TodoAgent({
      loadBoard: () => board.load(),
      listSessions: () => sessionIndex.list(),
      todos,
    }),
    usage: new UsageReader(),
    docs,
    flowAnswers: new FlowAnswerStore({ isViewable: (file) => docs.isViewable(file) }),
    gitGraph: { readGraph: graphReader(new MergedReader()), readCommit, readCommitDiff, switchBranch, readWorkingTree, readWorkingDiff },
  };
}

declare global {
  var __agentControlServices: Services | undefined;
}

export function services(): Services {
  globalThis.__agentControlServices ??= createServices();
  return globalThis.__agentControlServices;
}

export function reportError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  services().errorLog.record("error", scope, error, context);
}

export function reportWarning(scope: string, error: unknown, context?: Record<string, unknown>): void {
  services().errorLog.record("warn", scope, error, context);
}
