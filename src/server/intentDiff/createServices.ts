import "server-only";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { SymbolLookup } from "@/common/intentDiff/types";
import { buildIntentDiff, type IntentDiffRequest } from "@/server/intentDiff/build";
import { missingOr, reportAnd } from "@/server/shared/fallback";
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

export interface SymbolQuery {
  worktreePath: string;
  rev: string | null;
  file: string;
  line: number;
  column: number;
}

export function createIntentDiffServices({ projectDirOf, warn: reportWarning }: IntentDiffServiceDeps) {
  const askStore = new AskStore(DEFAULT_ASK_FILE, reportWarning);
  const themeReader = new EditorThemeReader(CURSOR_SETTINGS_FILE, reportWarning);
  const snapshotLog = new SnapshotLog(git, reportWarning);
  const transcriptLoader = new TranscriptLoader({ askSessionIds: () => askStore.sessionIds(), projectDirOf, warn: reportWarning });
  const languageServices = new LanguageServices();
  const highlighter = new Highlighter({ themes: () => themeReader.themes(), readBlobs, warn: reportWarning });

  const shownLine = async ({ worktreePath, rev, file, line }: SymbolQuery): Promise<string | null> => {
    if (!rev) return null;
    const text = await git(worktreePath, ["show", `${rev}:${file}`]).catch(reportAnd("", reportWarning, "intent-diff/symbol", { worktreePath, rev, file }));
    return text.split("\n")[line - 1] ?? null;
  };

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
    snapshotLog,
    transcriptLoader,
    languageServices,
    highlighter,
    buildIntentDiff: (request: IntentDiffRequest) => buildIntentDiff(request, { highlighter, snapshotLog, transcriptLoader }),
    lookupSymbol: async (query: SymbolQuery): Promise<SymbolLookup> => {
      const lookup = languageServices.lookup(query.worktreePath, query.file, query.line, query.column, await shownLine(query));
      await highlighter.lookup(query.worktreePath, lookup);
      return lookup;
    },
    isWorktree: async (worktreePath: string): Promise<boolean> => {
      if (!path.isAbsolute(worktreePath)) return false;
      const info = await stat(worktreePath).catch(missingOr(null, reportWarning, "intent-diff/ask", { worktreePath }));
      return info?.isDirectory() ?? false;
    },
  };
}
