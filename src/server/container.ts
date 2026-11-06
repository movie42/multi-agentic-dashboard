import "server-only";
import type { AskRunner } from "./intentDiff/AskRunner";
import type { AskStore } from "./intentDiff/AskStore";
import { createIntentDiffServices } from "./intentDiff/createServices";

type IntentDiffServices = ReturnType<typeof createIntentDiffServices>;
import { createOrcaServices, type OrcaServices } from "./orca/services";
import type { Highlighter } from "./intentDiff/Highlighter";
import type { LanguageServices } from "./intentDiff/LanguageServices";
import type { SnapshotLog } from "./intentDiff/SnapshotLog";
import type { TranscriptLoader } from "./intentDiff/TranscriptLoader";
import { PermissionStore } from "./permissions/PermissionStore";
import { ActivityReader } from "./sessions/ActivityReader";
import { BookmarkStore } from "./sessions/BookmarkStore";
import { BOOKMARK_FILE, LIVE_SESSIONS_DIR, PROJECTS_DIR, SESSION_CACHE_FILE } from "./sessions/paths";
import { SessionIndex } from "./sessions/SessionIndex";
import { SessionLocator } from "./sessions/SessionLocator";
import { SessionTitles } from "./sessions/SessionTitles";
import { ErrorLog } from "./shared/errorLog";
import { TODO_FILE } from "./todos/paths";
import { TodoLaunchAttacher } from "./todos/TodoLaunchAttacher";
import { TodoStore } from "./todos/TodoStore";
import { createWorkflowServices, type WorkflowServices } from "./workflow/services";
import { createWorktreeWizardServices, type WorktreeWizardServices } from "./worktreeWizard/services";

export interface Services {
  errorLog: ErrorLog;
  permissions: PermissionStore;
  sessionIndex: SessionIndex;
  sessionLocator: SessionLocator;
  sessionTitles: SessionTitles;
  activity: ActivityReader;
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
  orca: OrcaServices;
  worktreeWizard: WorktreeWizardServices;
  todos: TodoStore;
  todoLaunches: TodoLaunchAttacher;
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
  const sessionLocator = new SessionLocator({ projectsDir: PROJECTS_DIR, liveSessionsDir: LIVE_SESSIONS_DIR, warn });
  const permissions = new PermissionStore();
  const bookmarks = new BookmarkStore(BOOKMARK_FILE, warn);
  const todos = new TodoStore(TODO_FILE, warn);
  const intentDiff = createIntentDiffServices({ projectDirOf: (cwd) => sessionLocator.projectDirOf(cwd), warn });
  return {
    errorLog,
    permissions,
    sessionIndex: new SessionIndex({
      projectsDir: PROJECTS_DIR,
      cacheFile: SESSION_CACHE_FILE,
      askSessionIds: () => intentDiff.askStore.sessionIds(),
      warn,
    }),
    sessionLocator,
    sessionTitles,
    activity: new ActivityReader((sessionId) => sessionTitles.cachedTranscriptOf(sessionId)),
    bookmarks,
    ...intentDiff,
    workflow,
    orca: createOrcaServices(reporters, { workflow, permissions, bookmarks, sessionLocator, sessionTitles }),
    worktreeWizard: createWorktreeWizardServices(),
    todos,
    todoLaunches: new TodoLaunchAttacher(todos),
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
