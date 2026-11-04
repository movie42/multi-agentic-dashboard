import "server-only";
import type { AskRunner } from "./intentDiff/AskRunner";
import type { AskStore } from "./intentDiff/AskStore";
import { createIntentDiffServices } from "./intentDiff/createServices";
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
import { createWorkflowServices, type WorkflowServices } from "./workflow/services";

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
  workflow: WorkflowServices;
  orca: OrcaServices;
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
  const intentDiff = createIntentDiffServices();
  return {
    errorLog,
    permissions: new PermissionStore(),
    sessionIndex: new SessionIndex({
      projectsDir: PROJECTS_DIR,
      cacheFile: SESSION_CACHE_FILE,
      askSessionIds: () => intentDiff.askStore.sessionIds(),
      warn,
    }),
    sessionLocator: new SessionLocator({ projectsDir: PROJECTS_DIR, liveSessionsDir: LIVE_SESSIONS_DIR, warn }),
    sessionTitles,
    activity: new ActivityReader((sessionId) => sessionTitles.cachedTranscriptOf(sessionId)),
    bookmarks: new BookmarkStore(BOOKMARK_FILE, warn),
    ...intentDiff,
    workflow,
    orca: createOrcaServices(reporters, workflow),
  };
}

const holder = globalThis as typeof globalThis & { __agentControlServices?: Services };

export function services(): Services {
  holder.__agentControlServices ??= createServices();
  return holder.__agentControlServices;
}

export function reportError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  services().errorLog.record("error", scope, error, context);
}

export function reportWarning(scope: string, error: unknown, context?: Record<string, unknown>): void {
  services().errorLog.record("warn", scope, error, context);
}
