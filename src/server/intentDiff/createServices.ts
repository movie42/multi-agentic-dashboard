import "server-only";
import { spawn } from "node:child_process";
import { readBlobs, git } from "@/server/intentDiff/gitDiff";
import { CURSOR_SETTINGS_FILE, EditorThemeReader } from "@/server/intentDiff/editorTheme";
import { AskRunner, DEFAULT_ASK_TIMEOUT_MS, DEFAULT_PROJECTS_DIR, resolveClaudeBin } from "./AskRunner";
import { AskStore, DEFAULT_ASK_FILE } from "./AskStore";
import { Highlighter } from "./Highlighter";
import { LanguageServices } from "./LanguageServices";
import { SnapshotLog } from "./SnapshotLog";
import { TranscriptLoader } from "./TranscriptLoader";
import type { ReportFn } from "@/server/shared/ports";

export interface IntentDiffServiceDeps {
  projectDirOf: (cwd: string) => string;
  warn: ReportFn;
}

export function createIntentDiffServices({ projectDirOf, warn: reportWarning }: IntentDiffServiceDeps) {
  const askStore = new AskStore(DEFAULT_ASK_FILE, reportWarning);
  const themeReader = new EditorThemeReader(CURSOR_SETTINGS_FILE, reportWarning);
  return {
    askStore,
    askRunner: new AskRunner({
      store: askStore,
      spawn: (command, args, options) => spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] }),
      warn: reportWarning,
      claudeBin: resolveClaudeBin(),
      projectsDir: DEFAULT_PROJECTS_DIR,
      timeoutMs: DEFAULT_ASK_TIMEOUT_MS,
    }),
    snapshotLog: new SnapshotLog(git, reportWarning),
    transcriptLoader: new TranscriptLoader({ askSessionIds: () => askStore.sessionIds(), projectDirOf, warn: reportWarning }),
    languageServices: new LanguageServices(),
    highlighter: new Highlighter({ themes: () => themeReader.themes(), readBlobs, warn: reportWarning }),
  };
}
