import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import pty from "node-pty";
import { RUNNER_PORT, RUNNER_USAGE_FILE, type RunnerSession, type RunnerUsage } from "../src/common/runner/types.ts";
import { DEFAULT_ALLOWED_ORIGINS } from "./guard.ts";
import { Orchestration, ORCHESTRATION_FILE, parseSavedOrchestration } from "./orchestration/Orchestration.ts";
import { createRunnerServer, pasteOf } from "./server.ts";
import { runsOf } from "../src/common/templates/types.ts";
import { RUNS_FILE, TemplateRuns } from "./templates/TemplateRuns.ts";
import { TEMPLATES_FILE, TemplateStore } from "./templates/TemplateStore.ts";
import { commandFor } from "./session/command.ts";
import { Dictation } from "./session/Dictation.ts";
import { SessionRegistry } from "./session/SessionRegistry.ts";
import { parseSavedSessions, restoreRequestsOf, savedSessionsOf, SESSIONS_FILE } from "./session/restore.ts";
import { readShellEnv } from "./session/shellEnv.ts";

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
// Must match ATTACHMENT_DIR in app/api/attachments/route.ts; both run as the same user, so tmpdir() agrees.
const attachmentDir = path.join(tmpdir(), "agent-control", "attachments");
mkdir(attachmentDir, { recursive: true }).catch((error: unknown) => console.warn("[daemon] attachment folder", error));
// macOS tmpdir() is /var/folders/..., a symlink into /private/var; Claude may report either spelling.
const attachmentDirs = [...new Set([attachmentDir, path.join(realpathSync(tmpdir()), "agent-control", "attachments")])];

const sessionsFile = process.env.RUNNER_SESSIONS_FILE ?? path.join(dataDir, SESSIONS_FILE);
const orchestrationFile = process.env.RUNNER_ORCHESTRATION_FILE ?? path.join(dataDir, ORCHESTRATION_FILE);
const runsFile = process.env.RUNNER_RUNS_FILE ?? path.join(dataDir, RUNS_FILE);
const templatesFile = process.env.RUNNER_TEMPLATES_FILE ?? path.join(dataDir, TEMPLATES_FILE);
const SUBMIT_DELAY_MS = 300;
const CHECK_TIMEOUT_MS = 120_000;

async function writeAtomic(file: string, body: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, body);
  await rename(temporary, file);
}

async function saveUsage(usage: RunnerUsage): Promise<void> {
  await writeAtomic(usageFile, JSON.stringify(usage));
}

async function readSaved(file: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) console.error(`[runner] saved ${label} unreadable`, error);
    return null;
  }
}

interface Saver {
  file: string;
  label: string;
  last: string;
  queue: Promise<void>;
}

const savers = {
  stopped: false,
  sessions: { file: sessionsFile, label: "sessions", last: "", queue: Promise.resolve() } satisfies Saver,
  orchestration: { file: orchestrationFile, label: "orchestration", last: "", queue: Promise.resolve() } satisfies Saver,
  runs: { file: runsFile, label: "runs", last: "", queue: Promise.resolve() } satisfies Saver,
};

function save(saver: Saver, body: string): void {
  if (savers.stopped || body === saver.last) return;
  saver.last = body;
  saver.queue = saver.queue
    .then(() => writeAtomic(saver.file, body))
    .catch((error: unknown) => {
      if (saver.last === body) saver.last = "";
      console.error(`[runner] ${saver.label} save failed`, error);
    });
}

const SAVE_FLUSH_MS = 2000;

function flushSaves(): Promise<void> {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, SAVE_FLUSH_MS).unref());
  return Promise.race([Promise.all([savers.sessions.queue, savers.orchestration.queue, savers.runs.queue]).then(() => {}), timeout]);
}

const shellEnv = await readShellEnv(shell);

function sessionEnv(): Record<string, string> {
  const entries = Object.entries({ ...process.env, ...shellEnv }).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && !DROPPED_ENV.test(entry[0]),
  );
  return { ...Object.fromEntries(entries), TERM: "xterm-256color", COLORTERM: "truecolor", FLOW_NO_OPEN: "1" };
}

const relay: { onChange: () => void } = { onChange: () => {} };

const registry = new SessionRegistry({
  spawn: (file, args, options) => pty.spawn(file, args, { name: "xterm-256color", ...options }),
  commandFor: (request) => commandFor(request, { claude: command, shell, baseUrl, statusLine, attachmentDirs }),
  env: sessionEnv(),
  onChange: () => relay.onChange(),
  onUsage: (usage) => {
    saveUsage(usage).catch((error: unknown) => console.error("[runner] usage save failed", error));
  },
});

const orchestration = new Orchestration({
  get: (id) => registry.get(id),
  send: (id, text) => {
    registry.write(id, pasteOf(text));
    setTimeout(() => registry.write(id, "\r"), SUBMIT_DELAY_MS).unref();
  },
  onChange: () => relay.onChange(),
});
orchestration.load(parseSavedOrchestration(await readSaved(orchestrationFile, "orchestration")));

function runCheck(cwd: string, command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(shell, ["-lc", command], { cwd, env: { ...process.env, ...sessionEnv() }, timeout: CHECK_TIMEOUT_MS }, (error) => {
      if (error) console.log("[templates] check did not pass", cwd, command, error.code ?? error.message);
      resolve(!error);
    });
  });
}

const runs = new TemplateRuns({
  get: (id) => registry.get(id),
  launch: (request) => registry.launch(request),
  deliver: (id, text) => orchestration.deliver(id, text, null),
  lastAnswer: (id) => orchestration.lastAnswer(id),
  check: runCheck,
  onChange: () => relay.onChange(),
});
runs.load(runsOf(await readSaved(runsFile, "runs")));
const templates = new TemplateStore({ file: templatesFile, write: writeAtomic });

const dictationDir = path.join(dataDir, "dictation");
mkdir(dictationDir, { recursive: true }).catch((error: unknown) => console.warn("[daemon] dictation folder", error));
const dictation = new Dictation({
  spawn: (file, args, options) => pty.spawn(file, args, { name: "xterm-256color", ...options }),
  claude: command,
  cwd: dictationDir,
  env: sessionEnv(),
});
const runner = createRunnerServer({ registry, orchestration, runs, templates, dictation, port, allowedOrigins });
const lifecycle = { restored: false };

function persist(sessions: RunnerSession[]): void {
  save(savers.sessions, JSON.stringify({ sessions: savedSessionsOf(sessions) }));
  save(savers.orchestration, JSON.stringify(orchestration.snapshot(sessions)));
  save(savers.runs, JSON.stringify(runs.snapshot(sessions)));
}

relay.onChange = () => {
  const sessions = registry.list();
  // Before restore the registry is empty, and pruning then would drop every saved line.
  if (lifecycle.restored) {
    const liveIds = new Set(sessions.filter((session) => session.status !== "exited").map((session) => session.id));
    orchestration.prune(new Set(sessions.map((session) => session.id)));
    runs.prune(liveIds);
  }
  runner.broadcast({ type: "sessions", sessions: orchestration.decorate(sessions), runs: runs.list() });
  persist(sessions);
};

runner.server.on("error", (error) => {
  console.error("[runner] server error", error);
  process.exit(1);
});

const saved = parseSavedSessions(await readSaved(sessionsFile, "sessions"));

runner.server.listen(port, "127.0.0.1", () => {
  console.log(`[runner] listening on ${baseUrl} (claude: ${command})`);
  if (saved.length === 0) {
    lifecycle.restored = true;
    relay.onChange();
    return;
  }
  savers.stopped = true;
  const requests = restoreRequestsOf(saved).map((request) => {
    const id = request.launch.resumeSessionId;
    const conductor = id ? orchestration.conductor(id) : null;
    const parent = id ? orchestration.parentOf(id) : null;
    const askPermissions = parent !== null && orchestration.isConductor(parent);
    return {
      ...request,
      launch: {
        ...request.launch,
        ...(conductor ? { conductor: { scope: conductor.scope, grants: conductor.grants } } : {}),
        ...(askPermissions ? { askPermissions } : {}),
        ...(id ? runs.launchOptionsOf(id) : {}),
      },
    };
  });
  const restored = registry.restore(requests);
  savers.stopped = false;
  lifecycle.restored = true;
  relay.onChange();
  console.log(`[runner] restored ${restored.length}/${saved.length} sessions from ${sessionsFile}`);
});

async function shutdown(signal: string) {
  console.log(`[runner] ${signal} — closing sessions`);
  savers.stopped = true;
  await flushSaves();
  registry.closeAll();
  dictation.close();
  runner.server.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
