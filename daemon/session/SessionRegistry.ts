import type {
  RunnerLaunchRequest,
  RunnerPermissionAnswer,
  RunnerSession,
  RunnerSessionKind,
  RunnerUsage,
} from "../../src/common/runner/types.ts";
import {
  decisionFor,
  hookOutput,
  PERMISSION_HOLD_MS,
  type PermissionHookOutput,
  type PermissionRequestInput,
} from "./permissions.ts";
import type { RestoreRequest } from "./restore.ts";
import { createHeadlessScreen, type CreateScreen, type Screen } from "./screen.ts";
import type { StatusLineReport } from "./statusLine.ts";
import { nextStatus, type StatusSignal } from "./status.ts";

export interface PtyProcess {
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export interface SpawnOptions {
  cwd: string;
  cols: number;
  rows: number;
  env: Record<string, string>;
}

export type SpawnPty = (file: string, args: string[], options: SpawnOptions) => PtyProcess;

export interface TerminalListener {
  output(data: string): void;
  exit(exitCode: number): void;
}

export interface Attachment {
  scrollback: string;
  detach(): void;
}

export interface CommandRequest {
  id: string;
  kind: RunnerSessionKind;
  prompt?: string;
  resumeSessionId?: string;
  conductor?: boolean;
  askPermissions?: boolean;
  model?: string;
  effort?: string;
  judge?: boolean;
}

export interface Command {
  file: string;
  args: string[];
}

export interface RegistryOptions {
  spawn: SpawnPty;
  commandFor: (request: CommandRequest) => Command;
  env: Record<string, string>;
  now?: () => number;
  newId?: () => string;
  scrollbackLimit?: number;
  createScreen?: CreateScreen;
  exitedTtlMs?: number;
  onChange?: (sessions: RunnerSession[]) => void;
  onUsage?: (usage: RunnerUsage) => void;
  permissionHoldMs?: number;
}

interface HeldPermission {
  settle: (output: PermissionHookOutput) => void;
  timer: ReturnType<typeof setTimeout>;
}

const SETTLING_EVENTS: ReadonlySet<StatusSignal["event"]> = new Set<StatusSignal["event"]>(["UserPromptSubmit", "Stop", "exit"]);

interface Entry {
  hooked: boolean;
  session: RunnerSession;
  pty: PtyProcess;
  screen: Screen;
  chunks: string[];
  chunkSize: number;
  listeners: Set<TerminalListener>;
  held: HeldPermission | null;
  interruptWatchUntil: number;
}

const DEFAULT_SCROLLBACK = 256 * 1024;
const DEFAULT_EXITED_TTL_MS = 10 * 60 * 1000;
const INITIAL_COLS = 120;
const INITIAL_ROWS = 32;

const TRUST_WINDOW = 4096;
// Claude Code fires no Stop hook when Esc interrupts a turn; its only trace is this line on screen.
const INTERRUPTED_LINE = /^\s*⎿\s+Interrupted\b/;
const INTERRUPT_WATCH_MS = 5000;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export function asksForTrust(output: string): boolean {
  return /trust\s*this\s*folder/i.test(output.replace(ANSI, ""));
}

export function trimChunks(chunks: string[], limit: number): string[] {
  // eslint-disable-next-line no-restricted-syntax -- position loop walking back from the newest chunk
  let start = chunks.length;
  // eslint-disable-next-line no-restricted-syntax -- running size for the same loop
  let size = 0;
  while (start > 0 && size < limit) {
    start -= 1;
    size += chunks[start]?.length ?? 0;
  }
  const kept = chunks.slice(start);
  const overflow = size - limit;
  const [first, ...rest] = kept;
  return overflow > 0 && first !== undefined ? [first.slice(overflow), ...rest] : kept;
}

export class SessionRegistry {
  #entries = new Map<string, Entry>();
  #options: Required<Omit<RegistryOptions, "onChange" | "onUsage">> & Pick<RegistryOptions, "onChange" | "onUsage">;

  constructor(options: RegistryOptions) {
    this.#options = {
      now: Date.now,
      newId: () => crypto.randomUUID(),
      scrollbackLimit: DEFAULT_SCROLLBACK,
      createScreen: createHeadlessScreen,
      exitedTtlMs: DEFAULT_EXITED_TTL_MS,
      permissionHoldMs: PERMISSION_HOLD_MS,
      ...options,
    };
  }

  list(): RunnerSession[] {
    return [...this.#entries.values()].map((entry) => entry.session).sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id: string): RunnerSession | null {
    return this.#entries.get(id)?.session ?? null;
  }

  launch(request: RunnerLaunchRequest): RunnerSession {
    const { cwd } = request;
    const kind = request.kind ?? "claude";
    const resumeSessionId = kind === "claude" ? request.resumeSessionId : undefined;
    const prompt = kind === "claude" && request.prompt ? request.prompt : undefined;
    const running = resumeSessionId ? this.#entries.get(resumeSessionId) : undefined;
    if (running && running.session.status !== "exited") return running.session;
    running?.screen.dispose();
    const id = resumeSessionId ?? this.#options.newId();
    const now = this.#options.now();
    const conductor = kind === "claude" && request.conductor !== undefined;
    const askPermissions = kind === "claude" && request.askPermissions === true;
    const claude = kind === "claude";
    const command = this.#options.commandFor({
      id,
      kind,
      prompt,
      resumeSessionId,
      ...(conductor ? { conductor } : {}),
      ...(askPermissions ? { askPermissions } : {}),
      ...(claude && request.model ? { model: request.model } : {}),
      ...(claude && request.effort ? { effort: request.effort } : {}),
      ...(claude && request.judge ? { judge: true } : {}),
    });
    const pty = this.#options.spawn(command.file, command.args, {
      cwd,
      cols: INITIAL_COLS,
      rows: INITIAL_ROWS,
      env: this.#options.env,
    });
    const entry: Entry = {
      session: {
        id,
        cwd,
        kind,
        status: prompt ? "working" : "idle",
        interrupted: false,
        prompted: Boolean(prompt ?? resumeSessionId),
        startedAt: now,
        updatedAt: now,
        exitCode: null,
        model: running?.session.model ?? null,
        contextPercent: null,
        effort: running?.session.effort ?? null,
        conversationId: null,
        permission: null,
        orchestration: null,
      },
      hooked: false,
      pty,
      screen: this.#options.createScreen(INITIAL_COLS, INITIAL_ROWS),
      chunks: [],
      chunkSize: 0,
      listeners: new Set(),
      held: null,
      interruptWatchUntil: 0,
    };
    this.#entries.set(id, entry);
    pty.onData((data) => this.#append(entry, data));
    pty.onExit(({ exitCode }) => {
      if (this.#entries.get(id) !== entry) return;
      entry.session = { ...entry.session, exitCode };
      this.#releasePermission(entry, {});
      this.#apply(entry, { event: "exit" });
      entry.listeners.forEach((listener) => listener.exit(exitCode));
      setTimeout(() => {
        if (this.#entries.get(id) === entry) this.close(id);
      }, this.#options.exitedTtlMs).unref?.();
    });
    console.log("[runner] launched", kind, id, cwd, resumeSessionId ? "(resume)" : "");
    this.#changed();
    return entry.session;
  }

  restore(requests: RestoreRequest[]): RunnerSession[] {
    const restored = requests.flatMap((request) => {
      try {
        const session = this.launch(request.launch);
        const entry = this.#entries.get(session.id);
        if (!entry) return [];
        entry.session = { ...entry.session, startedAt: request.startedAt };
        return [entry.session];
      } catch (error) {
        console.error("[runner] restore failed", request.launch.cwd, error);
        return [];
      }
    });
    this.#changed();
    return restored;
  }

  attach(id: string, listener: TerminalListener): Attachment | null {
    const entry = this.#entries.get(id);
    if (!entry) return null;
    entry.listeners.add(listener);
    return { scrollback: trimChunks(entry.chunks, this.#options.scrollbackLimit).join(""), detach: () => entry.listeners.delete(listener) };
  }

  async screen(id: string): Promise<string[] | null> {
    const entry = this.#entries.get(id);
    return entry ? entry.screen.lines() : null;
  }

  write(id: string, data: string): void {
    const entry = this.#entries.get(id);
    if (!entry || entry.session.status === "exited") return;
    if (data === "\x1b" && entry.session.kind === "claude" && entry.session.status === "working") {
      entry.interruptWatchUntil = this.#options.now() + INTERRUPT_WATCH_MS;
    }
    entry.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.#entries.get(id);
    if (!entry || entry.session.status === "exited") return;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) return;
    entry.pty.resize(cols, rows);
    entry.screen.resize(cols, rows);
  }

  signal(id: string, signal: StatusSignal): boolean {
    const entry = this.#entries.get(id);
    if (!entry) return false;
    entry.hooked = true;
    if (SETTLING_EVENTS.has(signal.event)) this.#releasePermission(entry, {});
    if (signal.conversationId && signal.conversationId !== entry.session.conversationId) {
      entry.session = { ...entry.session, conversationId: signal.conversationId };
      this.#changed();
    }
    this.#apply(entry, signal);
    return true;
  }

  report(id: string, report: StatusLineReport): boolean {
    const entry = this.#entries.get(id);
    if (!entry) return false;
    if (report.usage) this.#options.onUsage?.({ ...report.usage, receivedAt: this.#options.now() });
    const model = report.model ?? entry.session.model;
    const contextPercent = report.contextPercent ?? entry.session.contextPercent;
    const effort = report.model !== null ? report.effort : entry.session.effort;
    if (model === entry.session.model && contextPercent === entry.session.contextPercent && effort === entry.session.effort) return true;
    entry.session = { ...entry.session, model, contextPercent, effort };
    this.#changed();
    return true;
  }

  holdPermission(id: string, input: PermissionRequestInput, delegatedTo: string | null = null): Promise<PermissionHookOutput> {
    const entry = this.#entries.get(id);
    if (!entry || entry.session.status === "exited") return Promise.resolve({});
    this.#releasePermission(entry, {});
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.#releasePermission(entry, {}), this.#options.permissionHoldMs);
      timer.unref?.();
      entry.held = { settle: resolve, timer };
      entry.session = {
        ...entry.session,
        permission: { id: this.#options.newId(), receivedAt: this.#options.now(), ...input, ...(delegatedTo ? { delegatedTo } : {}) },
      };
      this.#changed();
    });
  }

  answerPermission(id: string, requestId: string, answer: RunnerPermissionAnswer): boolean {
    const entry = this.#entries.get(id);
    const permission = entry?.session.permission;
    if (!entry || !permission || permission.id !== requestId) return false;
    const decision = decisionFor(permission, answer);
    if (!decision) return false;
    this.#releasePermission(entry, hookOutput(decision));
    return true;
  }

  cancelPermission(id: string, requestId: string): void {
    const entry = this.#entries.get(id);
    if (entry?.session.permission?.id === requestId) this.#releasePermission(entry, {});
  }

  close(id: string): boolean {
    const entry = this.#entries.get(id);
    if (!entry) return false;
    this.#releasePermission(entry, {});
    if (entry.session.status !== "exited") entry.pty.kill();
    entry.screen.dispose();
    this.#entries.delete(id);
    console.log("[runner] closed", id);
    this.#changed();
    return true;
  }

  closeAll(): void {
    [...this.#entries.keys()].forEach((id) => this.close(id));
  }

  #append(entry: Entry, data: string): void {
    entry.chunks.push(data);
    entry.chunkSize += data.length;
    if (entry.chunkSize > this.#options.scrollbackLimit * 2) {
      entry.chunks = trimChunks(entry.chunks, this.#options.scrollbackLimit);
      entry.chunkSize = entry.chunks.reduce((size, chunk) => size + chunk.length, 0);
    }
    entry.screen.write(data);
    entry.listeners.forEach((listener) => listener.output(data));
    if (entry.session.kind === "claude" && !entry.hooked && asksForTrust(trimChunks(entry.chunks, TRUST_WINDOW).join(""))) {
      this.#apply(entry, { event: "trust-prompt" });
    }
    if (entry.interruptWatchUntil > this.#options.now()) void this.#checkInterrupt(entry);
  }

  async #checkInterrupt(entry: Entry): Promise<void> {
    const lines = await entry.screen.lines();
    if (entry.session.status !== "working" || !lines.some((line) => INTERRUPTED_LINE.test(line))) return;
    entry.interruptWatchUntil = 0;
    this.#apply(entry, { event: "interrupt" });
  }

  #releasePermission(entry: Entry, output: PermissionHookOutput): void {
    const held = entry.held;
    if (!held) return;
    entry.held = null;
    clearTimeout(held.timer);
    held.settle(output);
    entry.session = { ...entry.session, permission: null };
    this.#changed();
  }

  #apply(entry: Entry, signal: StatusSignal): void {
    const status = nextStatus(entry.session.status, signal);
    const prompted = entry.session.prompted || signal.event === "UserPromptSubmit";
    const interrupted =
      signal.event === "UserPromptSubmit" ? false : entry.session.interrupted || (signal.event === "interrupt" && status !== entry.session.status);
    if (status === entry.session.status && prompted === entry.session.prompted && interrupted === entry.session.interrupted) return;
    entry.session = { ...entry.session, status, interrupted, prompted, updatedAt: this.#options.now() };
    this.#changed();
  }

  #changed(): void {
    this.#options.onChange?.(this.list());
  }
}
