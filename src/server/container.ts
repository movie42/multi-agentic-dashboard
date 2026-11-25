import "server-only";
import { readRunningSubagents } from "@/server/sessions/subagents";
import { readFile } from "node:fs/promises";
import type { AskRunner } from "./intentDiff/AskRunner";
import type { AskStore } from "./intentDiff/AskStore";
import { createIntentDiffServices } from "./intentDiff/createServices";

type IntentDiffServices = ReturnType<typeof createIntentDiffServices>;
import { BoardService } from "./board/BoardService";
import { listWorktrees } from "./projects/gitWorktrees";
import { OrcaImport } from "./projects/importFromOrca";
import { ORCA_BIN, PROJECTS_FILE, TERMINAL_ALIAS_FILE, TOKEN_LEDGER_FILE, WORKTREE_META_FILE } from "./projects/paths";
import { TokenLedger } from "./tokens/TokenLedger";
import { createTokenService, type TokenService } from "./tokens/recordCloses";
import { TerminalAliases } from "./runner/TerminalAliases";
import { ProjectRegistry, type Project } from "./projects/ProjectRegistry";
import { WorktreeActions } from "./projects/WorktreeActions";
import { WorktreeMeta } from "./projects/WorktreeMeta";
import { liveConversations } from "./runner/liveConversations";
import { RunnerClient } from "./runner/RunnerClient";
import { RUNNER_BASE_URL, spawnDaemon } from "./runner/spawnDaemon";
import { createVoice, withDictation, type VoiceIntent, type VoiceTerminal, type VoiceToggleResult } from "./runner/voice";
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
import { BOOKMARK_FILE, CLAUDE_SESSIONS_DIR, projectDirOf, PROJECTS_DIR, SESSION_CACHE_FILE } from "./sessions/paths";
import { SessionIndex } from "./sessions/SessionIndex";
import { SessionTitles } from "./sessions/SessionTitles";
import { DocServer } from "./docs/DocServer";
import { FileBrowser } from "./files/FileBrowser";
import { FlowAnswerStore } from "./docs/FlowAnswerStore";
import { ErrorLog } from "./shared/errorLog";
import { SKETCH_FILE } from "./sketches/paths";
import { SketchStore } from "./sketches/SketchStore";
import { TODO_FILE } from "./todos/paths";
import { TodoAgent } from "./todos/TodoAgent";
import { TodoJiraImporter } from "./todos/TodoJiraImporter";
import { TodoLaunchAttacher } from "./todos/TodoLaunchAttacher";
import { TodoLinker } from "./todos/TodoLinker";
import { TodoStore } from "./todos/TodoStore";
import { UsageReader } from "./usage/UsageReader";
import { DevPortReader } from "./devPorts/readDevPorts";
import { readCommit, readCommitDiff } from "./gitGraph/readCommit";
import { GRAPH_PAGE, readGraph } from "./gitGraph/readGraph";
import { MergedReader } from "./gitGraph/readMerged";
import { switchBranch } from "./gitGraph/switchBranch";
import { readWorkingDiff, readWorkingTree } from "./gitGraph/readWorkingTree";
import { readFileOverlaps } from "./projects/fileOverlaps";
import { ConductorActions } from "./orchestration/conductorActions";
import { createWorkflowServices, type WorkflowServices } from "./workflow/services";
import { createWorktreeWizardServices, type WorktreeWizardServices } from "./worktreeWizard/services";
import { draftTemplate } from "./templates/draftTemplate";
import { createAppStatusService, type AppStatusService } from "./appStatus/service";
import { proposeCommands, reviseCommands } from "./projects/commandAgent";

export interface Services {
  conductors: ConductorActions;
  errorLog: ErrorLog;
  sessionIndex: SessionIndex;
  sessionTitles: SessionTitles;
  activity: TranscriptTailReader<ActivityStep>;
  chat: TranscriptTailReader<ActivityStep>;
  conversation: TranscriptTailReader<ConversationTurn>;
  bookmarks: BookmarkStore;
  terminalAliases: TerminalAliases;
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
  draftTemplate: typeof draftTemplate;
  appStatus: AppStatusService;
  commandAgent: { propose: typeof proposeCommands; revise: typeof reviseCommands };
  todos: TodoStore;
  sketches: SketchStore;
  todoLaunches: TodoLaunchAttacher;
  todoLinker: TodoLinker;
  todoJira: TodoJiraImporter;
  todoAgent: TodoAgent;
  usage: UsageReader;
  tokens: TokenService;
  devPorts: DevPortReader;
  docs: DocServer;
  files: FileBrowser;
  flowAnswers: FlowAnswerStore;
  gitGraph: {
    readGraph: (worktreePath: string, skip: number) => ReturnType<typeof readGraph>;
    readCommit: typeof readCommit;
    readCommitDiff: typeof readCommitDiff;
    switchBranch: typeof switchBranch;
    readWorkingTree: typeof readWorkingTree;
    readWorkingDiff: typeof readWorkingDiff;
  };
  fileOverlaps: (worktreePaths: string[]) => ReturnType<typeof readFileOverlaps>;
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
  const terminalAliases = new TerminalAliases(TERMINAL_ALIAS_FILE, warn);
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
    terminalAliases: () => terminalAliases.read(),
    runnerSessions: async () => {
      const [sessions, live] = await Promise.all([
        runner.list(),
        liveConversations({ execFile: nodeExecFile, readFile: (file) => readFile(file, "utf8"), sessionsDir: CLAUDE_SESSIONS_DIR }).catch(
          (error: unknown) => {
            warn("board", error, { step: "live conversations" });
            return new Map<string, string>();
          },
        ),
      ]);
      // The hook's session_id moves on /clear right away; Claude Code rewrites <pid>.json only at the next prompt.
      return sessions.map((session) => ({ ...session, conversationId: session.conversationId ?? live.get(session.id) ?? null }));
    },
    workflow,
    sessions: {
      transcriptOf: (cwd, sessionId) => sessionTranscripts.read(cwd, sessionId),
      sessionRefOf: (file, size) => sessionTitles.refOf(file, size),
      readBookmarks: () => bookmarks.read(),
      subagentsOf: (file) => readRunningSubagents(file, Date.now()),
    },
    fs: nodeFileSystem,
    warn,
  });
  const docs = new DocServer({ worktreePaths: (options) => board.worktreePaths(options) });
  return {
    conductors: new ConductorActions({
      worktrees: async () => (await board.load()).worktrees,
      runner,
      createWorktree: (input) => worktrees.create(input),
    }),
    errorLog,
    sessionIndex,
    sessionTitles,
    activity: new TranscriptTailReader(transcriptOf, { parse: stepsOf, enough: STEP_LIMIT }),
    chat: new TranscriptTailReader(transcriptOf, { parse: chatItemsOf, enough: CHAT_LIMIT }),
    conversation: new TranscriptTailReader(transcriptOf, { parse: turnsOf, enough: TURN_LIMIT }),
    bookmarks,
    terminalAliases,
    ...intentDiff,
    workflow,
    board,
    runner,
    voice: withDictation(createVoice(voiceTerminal, { mode: () => readVoiceMode(CLAUDE_SETTINGS_FILE) }), () => runner.ensureDictation()),
    projects,
    worktreeMeta,
    worktrees,
    worktreeWizard: createWorktreeWizardServices(),
    draftTemplate,
    appStatus: createAppStatusService(runner),
    commandAgent: { propose: proposeCommands, revise: reviseCommands },
    todos,
    sketches: new SketchStore(SKETCH_FILE, warn),
    todoLaunches: new TodoLaunchAttacher(todos),
    todoLinker: new TodoLinker(todos, () => sessionIndex.list()),
    todoJira: new TodoJiraImporter(todos, workflow.jira, warn),
    todoAgent: new TodoAgent({
      loadBoard: () => board.load(),
      listSessions: () => sessionIndex.list(),
      todos,
    }),
    usage: new UsageReader(),
    tokens: createTokenService({ ledger: new TokenLedger(TOKEN_LEDGER_FILE, warn), projectsDir: PROJECTS_DIR }),
    devPorts: new DevPortReader(nodeExecFile),
    docs,
    files: new FileBrowser({
      worktreePaths: (options) => board.worktreePaths(options),
      highlight: (code, file) => intentDiff.highlighter.lines(code, file),
    }),
    flowAnswers: new FlowAnswerStore({ isViewable: (file) => docs.isViewable(file) }),
    gitGraph: { readGraph: graphReader(new MergedReader()), readCommit, readCommitDiff, switchBranch, readWorkingTree, readWorkingDiff },
    fileOverlaps: (worktreePaths) => readFileOverlaps(worktreePaths, warn),
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
