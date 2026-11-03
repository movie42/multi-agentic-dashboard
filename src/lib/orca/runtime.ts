import { execFile, spawn } from "node:child_process";
import { openSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ORCA_BIN, runOrca } from "./cli";

const execFileAsync = promisify(execFile);

export const ORCA_BUNDLE_ID = "com.stablyai.orca";

export type RuntimeMode = "app" | "headless" | "off";

export type RuntimeResponse = { ok: true; mode: RuntimeMode } | { ok: false; error: string };

interface OrcaStatusRaw {
  app: { running: boolean; pid: number | null; desktopWindowStatus?: string };
  runtime: { reachable: boolean };
}

interface RuntimeStatus {
  mode: RuntimeMode;
  pid: number | null;
}

const QUIT_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 60_000;
const POLL_MS = 500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await delay(POLL_MS);
  }
  return false;
}

const APP_EXECUTABLE = path.join(path.dirname(ORCA_BIN), "..", "..", "MacOS", "Orca");

async function commandOf(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "command=", "-p", String(pid)]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function readRuntime(): Promise<RuntimeStatus> {
  const status = await runOrca<OrcaStatusRaw>(["status"]).catch(() => null);
  if (!status || !status.app.running || !status.runtime.reachable || status.app.pid === null) {
    return { mode: "off", pid: status?.app.pid ?? null };
  }
  const command = await commandOf(status.app.pid);
  if (command === null) return { mode: "off", pid: null };
  const mode = command === path.resolve(APP_EXECUTABLE) ? "app" : "headless";
  if (mode === "headless") console.log("[runtime] headless process", status.app.pid, command);
  return { mode, pid: status.app.pid };
}

async function quitApp(pid: number | null) {
  await execFileAsync("osascript", ["-e", `quit app id "${ORCA_BUNDLE_ID}"`]);
  if (pid === null) return;
  const quit = await waitFor(() => !isAlive(pid), QUIT_TIMEOUT_MS);
  if (!quit) throw new Error("Orca 앱이 종료되지 않았어요. 종료 확인 창이 떠 있는지 확인해 주세요.");
}

async function stopServe(pid: number | null) {
  if (pid === null) return;
  process.kill(pid, "SIGTERM");
  const stopped = await waitFor(() => !isAlive(pid), QUIT_TIMEOUT_MS);
  if (!stopped) throw new Error(`헤드리스 Orca(pid ${pid})가 종료되지 않았어요.`);
}

function startServe() {
  const log = openSync(path.join(os.tmpdir(), "agent-control-orca-serve.log"), "a");
  const { ELECTRON_RUN_AS_NODE, PORT, HOSTNAME, ...rest } = process.env;
  const env: NodeJS.ProcessEnv = { ...rest, NODE_ENV: process.env.NODE_ENV };
  console.log("[runtime] starting orca serve", { ELECTRON_RUN_AS_NODE, PORT, HOSTNAME });
  const child = spawn(ORCA_BIN, ["serve", "--no-pairing"], {
    detached: true,
    stdio: ["ignore", log, log],
    env,
  });
  child.unref();
}

async function waitForMode(mode: RuntimeMode) {
  const ready = await waitFor(async () => (await readRuntime()).mode === mode, READY_TIMEOUT_MS);
  if (!ready) throw new Error(`Orca가 ${mode === "app" ? "앱" : "헤드리스"} 모드로 올라오지 않았어요.`);
}

export async function switchRuntime(target: Exclude<RuntimeMode, "off">): Promise<RuntimeMode> {
  const current = await readRuntime();
  if (current.mode === target) return target;

  if (target === "headless") {
    if (current.mode === "app") await quitApp(current.pid);
    startServe();
  } else {
    if (current.mode === "headless") await stopServe(current.pid);
    await runOrca(["open"], READY_TIMEOUT_MS);
  }
  await waitForMode(target);
  return target;
}
