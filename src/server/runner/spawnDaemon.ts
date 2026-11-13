import "server-only";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RUNNER_PORT } from "@/common/runner/types";
import { resolveClaudeBin } from "@/server/intentDiff/AskRunner";

export const RUNNER_BASE_URL = `http://127.0.0.1:${process.env.RUNNER_PORT ?? RUNNER_PORT}`;
export const RUNNER_LOG_FILE = path.join(os.tmpdir(), "agent-control-runner.log");

export function spawnDaemon(): void {
  const node = process.env.RUNNER_NODE ?? process.execPath;
  const entry = process.env.RUNNER_DAEMON_ENTRY ?? path.join(process.cwd(), "daemon", "main.ts");
  const log = openSync(RUNNER_LOG_FILE, "a");
  console.log("[runner] spawning daemon", node, entry, "log:", RUNNER_LOG_FILE);
  spawn(node, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", entry], {
    cwd: path.dirname(path.dirname(entry)),
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, RUNNER_CLAUDE_BIN: process.env.RUNNER_CLAUDE_BIN ?? resolveClaudeBin() },
  }).unref();
}
