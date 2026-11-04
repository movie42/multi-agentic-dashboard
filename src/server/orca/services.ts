import "server-only";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pendingByPane, settleStale } from "@/lib/permissions/store";
import { readBookmarks } from "@/lib/sessions/bookmarks";
import { findSession } from "@/lib/sessions/fullMessage";
import { sessionRefOf } from "@/lib/sessions/sessionTitle";
import { nodeExecFile, nodeFileSystem } from "@/server/shared/ports";
import type { Reporters, WorkflowServices } from "@/server/workflow/services";
import { BoardService } from "./BoardService";
import { DEFAULT_ORCA_BIN, OrcaCli } from "./OrcaCli";
import { OrcaRuntime, type ProcessPort } from "./OrcaRuntime";
import { OrphanReattacher } from "./OrphanReattacher";

export interface OrcaServices {
  cli: OrcaCli;
  runtime: OrcaRuntime;
  orphans: OrphanReattacher;
  board: BoardService;
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

export function createOrcaServices({ warn }: Reporters, workflow: WorkflowServices): OrcaServices {
  const cli = new OrcaCli(ORCA_BIN, nodeExecFile);
  const runtime = new OrcaRuntime({ cli, execFile: nodeExecFile, processes: nodeProcesses, warn });
  const orphans = new OrphanReattacher({ cli, runtime, warn });
  const board = new BoardService({
    cli,
    orphans,
    workflow,
    sessions: { findSession, sessionRefOf, readBookmarks },
    permissions: { settleStale, pendingByPane },
    fs: nodeFileSystem,
    warn,
  });
  return { cli, runtime, orphans, board };
}
