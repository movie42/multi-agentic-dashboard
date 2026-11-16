import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import pty from "node-pty";
import { RUNNER_PORT, RUNNER_USAGE_FILE, type RunnerSession, type RunnerUsage } from "../src/common/runner/types.ts";
import { DEFAULT_ALLOWED_ORIGINS } from "./guard.ts";
import { createRunnerServer } from "./server.ts";
import { commandFor } from "./session/command.ts";
import { SessionRegistry } from "./session/SessionRegistry.ts";
import { parseSavedSessions, restoreRequestsOf, savedSessionsOf, SESSIONS_FILE } from "./session/restore.ts";
import { readShellEnv } from "./session/shellEnv.ts";
import { ORCHESTRATION_FILE, type OrchestrationState } from "../src/common/orchestration/types.ts";
import { Orchestration } from "./orchestration/Orchestration.ts";
import { parseOrchestration, persistedOf } from "./orchestration/OrchestrationStore.ts";

const port = Number(process.env.RUNNER_PORT ?? RUNNER_PORT);
const baseUrl = `http://127.0.0.1:${port}`;
const command = process.env.RUNNER_CLAUDE_BIN ?? "claude";
const allowedOrigins = process.env.RUNNER_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()) ?? DEFAULT_ALLOWED_ORIGINS;

const DROPPED_ENV =
  /^(ORCA_|__NEXT_PRIVATE_|NODE_ENV$|CLAUDECODE$|CLAUDE_PID$|CLAUDE_CODE_(ENTRYPOINT|CHILD_SESSION|SESSION_ID|SESSION_ATTENDED|EXECPATH|MESSAGING_SOCKET|MESSAGING_TOKEN)$)/;

const shell = process.env.SHELL ?? "/bin/zsh";
const dataDir = process.env.AGENT_CONTROL_DATA_DIR ?? path.join(homedir(), ".local", "share", "agent-control");
const usageFile = process.env.RUNNER_USAGE_FILE ?? path.join(dataDir, RUNNER_USAGE_FILE);
const statusLine = { node: process.execPath, script: path.join(import.meta.dirname, "statusline.mjs") };

const sessionsFile = process.env.RUNNER_SESSIONS_FILE ?? path.join(dataDir, SESSIONS_FILE);
const orchestrationFile = process.env.RUNNER_ORCHESTRATION_FILE ?? path.join(dataDir, ORCHESTRATION_FILE);
const worktreeMetaFile = process.env.WORKTREE_META_FILE ?? path.join(dataDir, "worktrees.json");

async function writeAtomic(file: string, body: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, body);
  await rename(temporary, file);
}

async function saveUsage(usage: RunnerUsage): Promise<void> {
  await writeAtomic(usageFile, JSON.stringify(usage));
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) console.error("[runner] saved file unreadable", file, error);
    return null;
  }
}

const sessionSaver = { stopped: false, last: "", queue: Promise.resolve() };

function saveSessions(sessions: RunnerSession[]): void {
  if (sessionSaver.stopped) return;
  const body = JSON.stringify({ sessions: savedSessionsOf(sessions) });
  if (body === sessionSaver.last) return;
  sessionSaver.last = body;
  sessionSaver.queue = sessionSaver.queue
    .then(() => writeAtomic(sessionsFile, body))
    .catch((error: unknown) => {
      if (sessionSaver.last === body) sessionSaver.last = "";
      console.error("[runner] sessions save failed", error);
    });
}

const SAVE_FLUSH_MS = 2000;


const shellEnv = await readShellEnv(shell);

function sessionEnv(): Record<string, string> {
  const entries = Object.entries({ ...process.env, ...shellEnv }).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && !DROPPED_ENV.test(entry[0]),
  );
  return { ...Object.fromEntries(entries), TERM: "xterm-256color", COLORTERM: "truecolor" };
}

const relay: { onChange: (sessions: RunnerSession[]) => void; onOrchestration: (state: OrchestrationState) => void } = {
  onChange: () => {},
  onOrchestration: () => {},
};

const registry = new SessionRegistry({
  spawn: (file, args, options) => pty.spawn(file, args, { name: "xterm-256color", ...options }),
  commandFor: (request) => commandFor(request, { claude: command, shell, baseUrl, statusLine }),
  env: sessionEnv(),
  onChange: (sessions) => relay.onChange(sessions),
  onUsage: (usage) => {
    saveUsage(usage).catch((error: unknown) => console.error("[runner] usage save failed", error));
  },
});

const orchestration = new Orchestration({ registry, worktreeMetaFile, onChange: (state) => relay.onOrchestration(state) });
const orchestrationSaver = { stopped: false, last: "", queue: Promise.resolve() };

/** A restored session reopens under the conversation it was on, so saved lines name that id. */
function restoredIdOf(sessionId: string): string | null {
  const session = registry.get(sessionId);
  if (!session || session.status === "exited" || session.kind !== "claude" || !session.prompted) return null;
  return session.conversationId ?? session.id;
}

function saveOrchestration(): void {
  if (orchestrationSaver.stopped) return;
  const body = JSON.stringify(persistedOf(orchestration.store.state(), restoredIdOf));
  if (body === orchestrationSaver.last) return;
  orchestrationSaver.last = body;
  orchestrationSaver.queue = orchestrationSaver.queue
    .then(() => writeAtomic(orchestrationFile, body))
    .catch((error: unknown) => {
      if (orchestrationSaver.last === body) orchestrationSaver.last = "";
      console.error("[runner] orchestration save failed", error);
    });
}

const runner = createRunnerServer({ registry, port, allowedOrigins, orchestration });
relay.onChange = (sessions) => {
  runner.broadcast({ type: "sessions", sessions });
  saveSessions(sessions);
  orchestration.rules.sessionsChanged(sessions);
  saveOrchestration();
};
relay.onOrchestration = () => saveOrchestration();

runner.server.on("error", (error) => {
  console.error("[runner] server error", error);
  process.exit(1);
});

const saved = parseSavedSessions(await readJsonFile(sessionsFile));
orchestration.store.load(parseOrchestration(await readJsonFile(orchestrationFile)));

runner.server.listen(port, "127.0.0.1", () => {
  console.log(`[runner] listening on ${baseUrl} (claude: ${command})`);
  if (saved.length === 0) return;
  sessionSaver.stopped = true;
  orchestrationSaver.stopped = true;
  const requests = restoreRequestsOf(saved).map((request) =>
    request.launch.resumeSessionId && orchestration.store.conductor(request.launch.resumeSessionId)
      ? { ...request, launch: { ...request.launch, conductor: true } }
      : request,
  );
  const restored = registry.restore(requests);
  sessionSaver.stopped = false;
  orchestrationSaver.stopped = false;
  saveSessions(registry.list());
  saveOrchestration();
  console.log(`[runner] restored ${restored.length}/${saved.length} sessions from ${sessionsFile}`);
});

async function shutdown(signal: string) {
  console.log(`[runner] ${signal} — closing sessions`);
  sessionSaver.stopped = true;
  orchestrationSaver.stopped = true;
  await Promise.race([
    Promise.all([sessionSaver.queue, orchestrationSaver.queue]),
    new Promise<void>((resolve) => setTimeout(resolve, SAVE_FLUSH_MS).unref()),
  ]);
  registry.closeAll();
  runner.server.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
