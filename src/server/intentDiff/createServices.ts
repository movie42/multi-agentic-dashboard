import "server-only";
import { spawn } from "node:child_process";
import { readBlobs, git } from "@/lib/intentDiff/gitDiff";
import { editorThemes } from "@/lib/intentDiff/editorTheme";
import { projectDirOf } from "@/lib/sessions/fullMessage";
import { AskRunner, DEFAULT_ASK_TIMEOUT_MS, DEFAULT_PROJECTS_DIR, resolveClaudeBin } from "./AskRunner";
import { AskStore, DEFAULT_ASK_FILE } from "./AskStore";
import { Highlighter } from "./Highlighter";
import { LanguageServices } from "./LanguageServices";
import { SnapshotLog } from "./SnapshotLog";
import { TranscriptLoader } from "./TranscriptLoader";
import { reportWarning } from "../container";

export function createIntentDiffServices() {
  const askStore = new AskStore(DEFAULT_ASK_FILE, reportWarning);
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
    highlighter: new Highlighter({ themes: editorThemes, readBlobs, warn: reportWarning }),
  };
}
