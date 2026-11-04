import "server-only";
import { errorCode, exitCode, type ExecFileFn, type ReportFn } from "@/server/shared/ports";
import type { OrcaCli } from "./OrcaCli";
import { appExecutableOf, modeOfCommand, serveEnv, type RuntimeMode, type RuntimeStatus } from "./runtimeMode";
import { orcaStatusSchema } from "./schema";

export const ORCA_BUNDLE_ID = "com.stablyai.orca";

export interface ProcessPort {
  kill(pid: number, signal: NodeJS.Signals | 0): void;
  spawnDetached(command: string, args: string[], env: NodeJS.ProcessEnv): void;
  env(): NodeJS.ProcessEnv;
}

export interface OrcaRuntimeOptions {
  cli: OrcaCli;
  execFile: ExecFileFn;
  processes: ProcessPort;
  warn: ReportFn;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  quitTimeoutMs?: number;
  readyTimeoutMs?: number;
  pollMs?: number;
}

export class OrcaRuntime {
  private readonly cli: OrcaCli;
  private readonly execFile: ExecFileFn;
  private readonly processes: ProcessPort;
  private readonly warn: ReportFn;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly quitTimeoutMs: number;
  private readonly readyTimeoutMs: number;
  private readonly pollMs: number;
  private readonly appExecutable: string;

  constructor(options: OrcaRuntimeOptions) {
    this.cli = options.cli;
    this.execFile = options.execFile;
    this.processes = options.processes;
    this.warn = options.warn;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.quitTimeoutMs = options.quitTimeoutMs ?? 30_000;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 60_000;
    this.pollMs = options.pollMs ?? 500;
    this.appExecutable = appExecutableOf(options.cli.bin);
  }

  read(): Promise<RuntimeStatus> {
    return this.readStatus(true);
  }

  async switchTo(target: Exclude<RuntimeMode, "off">): Promise<RuntimeMode> {
    const current = await this.read();
    if (current.mode === target) return target;

    if (target === "headless") {
      if (current.mode === "app") await this.quitApp(current.pid);
      this.startServe();
    } else {
      if (current.mode === "headless") await this.stopServe(current.pid);
      await this.cli.run(["open"], this.readyTimeoutMs);
    }
    await this.waitForMode(target);
    return target;
  }

  private async readStatus(reportFailure: boolean): Promise<RuntimeStatus> {
    const status = await this.cli.run(["status"], orcaStatusSchema).catch((error: unknown) => {
      if (reportFailure) this.warn("runtime", error, { step: "orca status" });
      return null;
    });
    if (!status || !status.app.running || !status.runtime.reachable || status.app.pid === null) {
      return { mode: "off", pid: status?.app.pid ?? null };
    }
    const command = await this.commandOf(status.app.pid);
    if (command === null) return { mode: "off", pid: null };
    const mode = modeOfCommand(command, this.appExecutable);
    if (mode === "headless") console.log("[runtime] headless process", status.app.pid, command);
    return { mode, pid: status.app.pid };
  }

  private async commandOf(pid: number): Promise<string | null> {
    return this.execFile("ps", ["-o", "command=", "-p", String(pid)]).then(
      ({ stdout }) => stdout.trim() || null,
      (error: unknown) => {
        if (exitCode(error) !== 1) this.warn("runtime", error, { step: "ps", pid });
        return null;
      },
    );
  }

  private isAlive(pid: number): boolean {
    try {
      this.processes.kill(pid, 0);
      return true;
    } catch (error) {
      if (errorCode(error) !== "ESRCH") this.warn("runtime", error, { step: "kill -0", pid });
      return false;
    }
  }

  private async waitFor(check: () => Promise<boolean> | boolean, timeoutMs: number): Promise<boolean> {
    const deadline = this.now() + timeoutMs;
    while (this.now() < deadline) {
      if (await check()) return true;
      await this.sleep(this.pollMs);
    }
    return false;
  }

  private async quitApp(pid: number | null): Promise<void> {
    await this.execFile("osascript", ["-e", `quit app id "${ORCA_BUNDLE_ID}"`]);
    if (pid === null) return;
    const quit = await this.waitFor(() => !this.isAlive(pid), this.quitTimeoutMs);
    if (!quit) throw new Error("Orca 앱이 종료되지 않았어요. 종료 확인 창이 떠 있는지 확인해 주세요.");
  }

  private async stopServe(pid: number | null): Promise<void> {
    if (pid === null) return;
    this.processes.kill(pid, "SIGTERM");
    const stopped = await this.waitFor(() => !this.isAlive(pid), this.quitTimeoutMs);
    if (!stopped) throw new Error(`헤드리스 Orca(pid ${pid})가 종료되지 않았어요.`);
  }

  private startServe(): void {
    const { ELECTRON_RUN_AS_NODE, PORT, HOSTNAME } = this.processes.env();
    console.log("[runtime] starting orca serve", { ELECTRON_RUN_AS_NODE, PORT, HOSTNAME });
    this.processes.spawnDetached(this.cli.bin, ["serve", "--no-pairing"], serveEnv(this.processes.env()));
  }

  private async waitForMode(mode: RuntimeMode): Promise<void> {
    const ready = await this.waitFor(async () => (await this.readStatus(false)).mode === mode, this.readyTimeoutMs);
    if (!ready) throw new Error(`Orca가 ${mode === "app" ? "앱" : "헤드리스"} 모드로 올라오지 않았어요.`);
  }
}
