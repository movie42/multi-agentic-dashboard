import { DICTATION_HANDLE } from "../../src/common/runner/types.ts";
import { createHeadlessScreen, type CreateScreen, type Screen } from "./screen.ts";
import { asksForTrust, type PtyProcess, type SpawnPty } from "./SessionRegistry.ts";

export { DICTATION_HANDLE };

export interface DictationOptions {
  spawn: SpawnPty;
  claude: string;
  cwd: string;
  env: Record<string, string>;
  createScreen?: CreateScreen;
  readyTimeoutMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface Live {
  pty: PtyProcess;
  screen: Screen;
  exited: boolean;
}

const COLS = 120;
const ROWS = 32;
const PROMPT_LINE = /^\s*❯/;
const TRUST_YES = /Yes, I trust this folder/;
const ARROW_DOWN = "\x1b[B";

export const DICTATION_ARGS = ["--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--tools", ""];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class Dictation {
  #options: Required<DictationOptions>;
  #live: Live | null = null;
  #starting: Promise<void> | null = null;

  constructor(options: DictationOptions) {
    this.#options = { createScreen: createHeadlessScreen, readyTimeoutMs: 30_000, pollMs: 200, sleep: defaultSleep, now: Date.now, ...options };
  }

  ensure(): Promise<void> {
    if (this.#live && !this.#live.exited && !this.#starting) return Promise.resolve();
    this.#starting ??= this.#start().finally(() => {
      this.#starting = null;
    });
    return this.#starting;
  }

  async screen(): Promise<string[] | null> {
    return this.#live && !this.#live.exited ? this.#live.screen.lines() : null;
  }

  write(data: string): boolean {
    if (!this.#live || this.#live.exited) return false;
    this.#live.pty.write(data);
    return true;
  }

  close(): void {
    const live = this.#live;
    this.#live = null;
    if (!live) return;
    live.exited = true;
    live.screen.dispose();
    try {
      live.pty.kill();
    } catch (error) {
      console.warn("[dictation] kill failed", error);
    }
  }

  async #start(): Promise<void> {
    this.close();
    const { spawn, claude, cwd, env, createScreen } = this.#options;
    const pty = spawn(claude, DICTATION_ARGS, { cwd, cols: COLS, rows: ROWS, env });
    const live: Live = { pty, screen: createScreen(COLS, ROWS), exited: false };
    this.#live = live;
    pty.onData((data) => {
      if (live.exited) return;
      live.screen.write(data);
    });
    pty.onExit(({ exitCode }) => {
      console.log("[dictation] exited", exitCode);
      if (this.#live === live) this.#live = null;
      live.exited = true;
      live.screen.dispose();
    });
    console.log("[dictation] started", cwd);
    const deadline = this.#options.now() + this.#options.readyTimeoutMs;
    const keyed = { screen: "" };
    while (this.#options.now() < deadline) {
      if (live.exited) throw new Error("받아쓰기 세션이 바로 끝났어요. 터미널에서 claude가 실행되는지 확인해 주세요.");
      const lines = await live.screen.lines();
      const trustYes = lines.find((line) => TRUST_YES.test(line));
      const shown = lines.join("\n");
      if (trustYes !== undefined) {
        if (shown !== keyed.screen) {
          keyed.screen = shown;
          pty.write(PROMPT_LINE.test(trustYes) ? "\r" : ARROW_DOWN);
        }
      } else if (lines.some((line) => PROMPT_LINE.test(line)) && !asksForTrust(lines.join("\n"))) return;
      await this.#options.sleep(this.#options.pollMs);
    }
    throw new Error("받아쓰기 세션이 준비되지 않았어요. 잠시 뒤 다시 눌러 주세요.");
  }
}
