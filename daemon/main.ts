import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import pty from "node-pty";
import { RUNNER_PORT, RUNNER_USAGE_FILE, type RunnerSession, type RunnerUsage } from "../src/common/runner/types.ts";
import { DEFAULT_ALLOWED_ORIGINS } from "./guard.ts";
import { createRunnerServer } from "./server.ts";
import { commandFor } from "./session/command.ts";
import { SessionRegistry } from "./session/SessionRegistry.ts";
import { readShellEnv } from "./session/shellEnv.ts";

const port = Number(process.env.RUNNER_PORT ?? RUNNER_PORT);
const baseUrl = `http://127.0.0.1:${port}`;
const command = process.env.RUNNER_CLAUDE_BIN ?? "claude";
const allowedOrigins = process.env.RUNNER_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()) ?? DEFAULT_ALLOWED_ORIGINS;

const DROPPED_ENV =
  /^(ORCA_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_CODE_(ENTRYPOINT|CHILD_SESSION|SESSION_ID|SESSION_ATTENDED|EXECPATH|MESSAGING_SOCKET|MESSAGING_TOKEN)$)/;

const shell = process.env.SHELL ?? "/bin/zsh";
const dataDir = process.env.AGENT_CONTROL_DATA_DIR ?? path.join(homedir(), ".local", "share", "agent-control");
const usageFile = process.env.RUNNER_USAGE_FILE ?? path.join(dataDir, RUNNER_USAGE_FILE);
const statusLine = { node: process.execPath, script: path.join(import.meta.dirname, "statusline.mjs") };

async function saveUsage(usage: RunnerUsage): Promise<void> {
  await mkdir(path.dirname(usageFile), { recursive: true });
  const temporary = `${usageFile}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(usage));
  await rename(temporary, usageFile);
}
const shellEnv = await readShellEnv(shell);

function sessionEnv(): Record<string, string> {
  const entries = Object.entries({ ...process.env, ...shellEnv }).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && !DROPPED_ENV.test(entry[0]),
  );
  return { ...Object.fromEntries(entries), TERM: "xterm-256color", COLORTERM: "truecolor" };
}

const relay: { onChange: (sessions: RunnerSession[]) => void } = { onChange: () => {} };

const registry = new SessionRegistry({
  spawn: (file, args, options) => pty.spawn(file, args, { name: "xterm-256color", ...options }),
  commandFor: (request) => commandFor(request, { claude: command, shell, baseUrl, statusLine }),
  env: sessionEnv(),
  onChange: (sessions) => relay.onChange(sessions),
  onUsage: (usage) => {
    saveUsage(usage).catch((error: unknown) => console.error("[runner] usage save failed", error));
  },
});

const runner = createRunnerServer({ registry, port, allowedOrigins });
relay.onChange = (sessions) => runner.broadcast({ type: "sessions", sessions });

runner.server.on("error", (error) => {
  console.error("[runner] server error", error);
  process.exit(1);
});

runner.server.listen(port, "127.0.0.1", () => {
  console.log(`[runner] listening on ${baseUrl} (claude: ${command})`);
});

function shutdown(signal: string) {
  console.log(`[runner] ${signal} — closing sessions`);
  registry.closeAll();
  runner.server.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
