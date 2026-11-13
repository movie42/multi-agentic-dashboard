import "server-only";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PermissionStore } from "@/server/permissions/PermissionStore";
import type { BookmarkStore } from "@/server/sessions/BookmarkStore";
import type { SessionLocator } from "@/server/sessions/SessionLocator";
import type { SessionTitles } from "@/server/sessions/SessionTitles";
import { nodeExecFile, nodeFileSystem } from "@/server/shared/ports";
import type { Reporters, WorkflowServices } from "@/server/workflow/services";
import { BoardService } from "./BoardService";
import { readVoice, toggleVoice } from "./voice";
import { importProject, type ProjectKind } from "./importProject";
import { DEFAULT_ORCA_BIN, OrcaCli } from "./OrcaCli";
import { OrcaRuntime, type ProcessPort } from "./OrcaRuntime";
import { OrphanReattacher } from "./OrphanReattacher";

export interface OrcaServices {
  cli: OrcaCli;
  runtime: OrcaRuntime;
  orphans: OrphanReattacher;
  board: BoardService;
  importProject: (folder: string) => Promise<ProjectKind>;
  toggleVoice: (terminalHandle: string) => Promise<boolean>;
  readVoice: (terminalHandle: string) => Promise<{ recording: boolean; transcript: string }>;
}

export const ORCA_BIN = process.env.ORCA_BIN ?? DEFAULT_ORCA_BIN;

const nodeProcesses: ProcessPort = {
  kill: (pid, signal) => {
    process.kill(pid, signal);
  },
  spawnDetached: (command, args, env) => {
    const log = openSync(path.join(os.tmpdir(), "agent-control-orca-serve.log"), "a");
    spawn(command, args, { detached: true, stdio: ["ignore", log, log], env }).unref();
  },
  env: () => process.env,
};

export interface OrcaDeps {
  workflow: WorkflowServices;
  permissions: PermissionStore;
  bookmarks: BookmarkStore;
  sessionLocator: SessionLocator;
  sessionTitles: SessionTitles;
}

export function createOrcaServices({ warn }: Reporters, deps: OrcaDeps): OrcaServices {
  const { workflow, permissions, bookmarks, sessionLocator, sessionTitles } = deps;
  const cli = new OrcaCli(ORCA_BIN, nodeExecFile);
  const runtime = new OrcaRuntime({ cli, execFile: nodeExecFile, processes: nodeProcesses, warn });
  const orphans = new OrphanReattacher({ cli, runtime, warn });
  const board = new BoardService({
    cli,
    orphans,
    workflow,
    sessions: {
      findSession: (paneKey, cwd, preview, prompt) => sessionLocator.find(paneKey, cwd, preview, prompt),
      sessionRefOf: (file, size) => sessionTitles.refOf(file, size),
      readBookmarks: () => bookmarks.read(),
    },
    permissions: {
      settleStale: (paneKey, state, since) => permissions.settleStale(paneKey, state, since),
      pendingByPane: () => permissions.pendingByPane(),
    },
    fs: nodeFileSystem,
    warn,
  });
  return { cli, runtime, orphans, board, importProject: (folder) => importProject(cli, folder),
    toggleVoice: (terminalHandle) => toggleVoice(cli, terminalHandle),
    readVoice: (terminalHandle) => readVoice(cli, terminalHandle),
  };
}
