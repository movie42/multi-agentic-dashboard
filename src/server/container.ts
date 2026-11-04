import "server-only";
import type { AskRunner } from "./intentDiff/AskRunner";
import type { AskStore } from "./intentDiff/AskStore";
import { createIntentDiffServices } from "./intentDiff/createServices";
import type { Highlighter } from "./intentDiff/Highlighter";
import type { LanguageServices } from "./intentDiff/LanguageServices";
import type { SnapshotLog } from "./intentDiff/SnapshotLog";
import type { TranscriptLoader } from "./intentDiff/TranscriptLoader";
import { ErrorLog } from "./shared/errorLog";

export interface Services {
  errorLog: ErrorLog;
  askStore: AskStore;
  askRunner: AskRunner;
  snapshotLog: SnapshotLog;
  transcriptLoader: TranscriptLoader;
  languageServices: LanguageServices;
  highlighter: Highlighter;
}

function createServices(): Services {
  return {
    errorLog: new ErrorLog(),
    ...createIntentDiffServices(),
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
