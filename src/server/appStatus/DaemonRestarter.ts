import "server-only";
import type { DaemonRestartState } from "@/common/appStatus/types";
import { nodeExecFile, type ExecFileFn } from "@/server/shared/ports";

export const IDLE_POLL_MS = 5000;
const STOP_POLL_MS = 250;
const STOP_TIMEOUT_MS = 10_000;

export interface DaemonRestarterDeps {
  workingCount: () => Promise<number>;
  stop: () => Promise<void>;
  start: () => Promise<void>;
  now?: () => number;
  every?: (work: () => void, ms: number) => () => void;
}

const defaultEvery = (work: () => void, ms: number) => {
  const timer = setInterval(work, ms);
  timer.unref?.();
  return () => clearInterval(timer);
};

export class DaemonRestarter {
  private current: DaemonRestartState = { kind: "idle" };
  private stopPolling: (() => void) | null = null;
  private checking = false;

  constructor(private readonly deps: DaemonRestarterDeps) {}

  state(): DaemonRestartState {
    return this.current;
  }

  async request(when: "now" | "idle"): Promise<DaemonRestartState> {
    if (this.current.kind === "restarting") return this.current;
    if (when === "now" || (await this.deps.workingCount()) === 0) {
      await this.restart();
      return this.current;
    }
    if (this.current.kind !== "scheduled") {
      this.current = { kind: "scheduled", requestedAt: (this.deps.now ?? Date.now)() };
      this.stopPolling = (this.deps.every ?? defaultEvery)(() => void this.checkIdle(), IDLE_POLL_MS);
    }
    return this.current;
  }

  cancel(): DaemonRestartState {
    if (this.current.kind === "scheduled") {
      this.clearPolling();
      this.current = { kind: "idle" };
    }
    return this.current;
  }

  private async checkIdle(): Promise<void> {
    if (this.checking || this.current.kind !== "scheduled") return;
    this.checking = true;
    try {
      if ((await this.deps.workingCount()) === 0) await this.restart();
    } catch (error) {
      console.warn("[daemon-restart] idle check failed", error);
    } finally {
      this.checking = false;
    }
  }

  private clearPolling(): void {
    this.stopPolling?.();
    this.stopPolling = null;
  }

  private async restart(): Promise<void> {
    this.clearPolling();
    this.current = { kind: "restarting" };
    try {
      await this.deps.stop();
      await this.deps.start();
      this.current = { kind: "idle" };
      console.log("[daemon-restart] restarted the session runner daemon");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[daemon-restart] failed", error);
      this.current = { kind: "failed", message };
    }
  }
}

async function listeningPid(port: number, exec: ExecFileFn): Promise<number | null> {
  try {
    const { stdout } = await exec("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    const pid = Number.parseInt(stdout.trim().split("\n")[0] ?? "", 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function stopDaemonOnPort(port: number, exec: ExecFileFn = nodeExecFile): Promise<void> {
  const pid = await listeningPid(port, exec);
  if (pid === null) return;
  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await wait(STOP_POLL_MS);
    if ((await listeningPid(port, exec)) === null) return;
  }
  console.warn("[daemon-restart] daemon ignored SIGTERM, killing", pid);
  process.kill(pid, "SIGKILL");
  await wait(STOP_POLL_MS * 2);
}
