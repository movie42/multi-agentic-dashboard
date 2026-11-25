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
import { terminalMenu } from "../../src/common/terminal/menu.ts";
import { createHeadlessScreen, renderLog, type CreateScreen, type Screen } from "./screen.ts";
import type { StatusLineReport } from "./statusLine.ts";
import { permissionModeOnScreen } from "./permissionMode.ts";
import { nextStatus, type StatusSignal } from "./status.ts";
import { readShellMarks } from "./shellIntegration.ts";
import { portsUnder, type ReadCommand } from "./shellPorts.ts";

export interface PtyProcess {
  /** The spawned process id; dev servers a shell starts are found under it. */
  readonly pid?: number;
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
  model?: string;
  effort?: string;
  judge?: boolean;
}

export interface Command {
  file: string;
  args: string[];
  /** Added on top of the registry's environment for this process. */
  env?: Record<string, string>;
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
  cols: number;
  chunks: string[];
  chunkSize: number;
  listeners: Set<TerminalListener>;
  held: HeldPermission | null;
  interruptWatchUntil: number;
  menuOpen: boolean;
  /** A /compact is running; its end shows only as a SessionStart with source `compact`. */
  compacting: boolean;
  modeCheck: ReturnType<typeof setTimeout> | null;
  /** The start of a shell mark cut off at the end of the last output chunk. */
  markCarry: string;
}

const DEFAULT_SCROLLBACK = 256 * 1024;
const DEFAULT_EXITED_TTL_MS = 10 * 60 * 1000;
const INITIAL_COLS = 120;
const INITIAL_ROWS = 32;

const TRUST_WINDOW = 4096;
// Claude Code fires no Stop hook when Esc interrupts a turn; its only trace is this line on screen.
const INTERRUPTED_LINE = /^\s*⎿\s+Interrupted\b/;
const INTERRUPT_WATCH_MS = 5000;
const COMPACT_PROMPT_LINE = /^\s*❯\s*\/compact\b/;
// A /compact that ends without compacting sends no hook; its only trace is one of these lines under the command.
const COMPACT_ENDED_LINE =
  /^\s*⎿\s+(?:Not enough messages to compact|Conversation too long|Compaction (?:blocked|interrupted|canceled|cancelled|failed)|Failed to generate conversation summary|Error(?: during compaction| compacting)?\b)/;

export function compactEndedOnScreen(lines: string[]): boolean {
  const asked = lines.findLastIndex((line) => COMPACT_PROMPT_LINE.test(line));
  return asked !== -1 && lines.slice(asked + 1).some((line) => COMPACT_ENDED_LINE.test(line));
}
const MODE_CHECK_MS = 300;
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
    const claude = kind === "claude";
    const command = this.#options.commandFor({
      id,
      kind,
      prompt,
      resumeSessionId,
      ...(conductor ? { conductor } : {}),
      ...(claude && request.model ? { model: request.model } : {}),
      ...(claude && request.effort ? { effort: request.effort } : {}),
      ...(claude && request.judge ? { judge: true } : {}),
    });
    const pty = this.#options.spawn(command.file, command.args, {
      cwd,
      cols: INITIAL_COLS,
      rows: INITIAL_ROWS,
      env: { ...this.#options.env, ...command.env },
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
        permissionMode: claude ? "bypassPermissions" : null,
        conversationId: null,
        permission: null,
        orchestration: null,
        shell: kind === "shell" ? { integrated: false, running: null, lastExit: null, ports: [] } : null,
      },
      hooked: false,
      pty,
      screen: this.#options.createScreen(INITIAL_COLS, INITIAL_ROWS),
      cols: INITIAL_COLS,
      chunks: [],
      chunkSize: 0,
      listeners: new Set(),
      held: null,
      interruptWatchUntil: 0,
      menuOpen: false,
      compacting: false,
      modeCheck: null,
      markCarry: "",
    };
    this.#entries.set(id, entry);
    pty.onData((data) => this.#append(entry, data));
    pty.onExit(({ exitCode }) => {
      if (this.#entries.get(id) !== entry) return;
      const shell = entry.session.shell;
      entry.session = { ...entry.session, exitCode, shell: shell ? { ...shell, running: null, ports: [] } : shell };
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

  /** The session's retained output as plain text, last `maxLines` lines. */
  async log(id: string, maxLines: number): Promise<string | null> {
    const entry = this.#entries.get(id);
    return entry ? renderLog(trimChunks(entry.chunks, this.#options.scrollbackLimit).join(""), entry.cols, maxLines) : null;
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
    entry.cols = cols;
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
    if (signal.permissionMode) this.#setPermissionMode(entry, signal.permissionMode);
    if (signal.event === "PreCompact") entry.compacting = signal.compactTrigger === "manual";
    const endsCompact = entry.compacting && signal.event === "SessionStart" && signal.sessionSource === "compact";
    if (signal.event === "SessionStart" || signal.event === "UserPromptSubmit" || signal.event === "Stop") entry.compacting = false;
    this.#apply(entry, { ...signal, endsCompact });
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

  holdPermission(id: string, input: PermissionRequestInput): Promise<PermissionHookOutput> {
    const entry = this.#entries.get(id);
    if (!entry || entry.session.status === "exited") return Promise.resolve({});
    this.#releasePermission(entry, {});
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.#releasePermission(entry, {}), this.#options.permissionHoldMs);
      timer.unref?.();
      entry.held = { settle: resolve, timer };
      entry.session = {
        ...entry.session,
        permission: { id: this.#options.newId(), receivedAt: this.#options.now(), ...input },
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
    this.#apply(entry, { event: "permission-answered" });
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
    if (entry.modeCheck) clearTimeout(entry.modeCheck);
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
    if (entry.session.kind === "shell") this.#readMarks(entry, data);
    if (entry.session.kind === "claude" && !entry.hooked && asksForTrust(trimChunks(entry.chunks, TRUST_WINDOW).join(""))) {
      this.#apply(entry, { event: "trust-prompt" });
    }
    if (entry.interruptWatchUntil > this.#options.now()) void this.#checkInterrupt(entry);
    if (entry.compacting) void this.#checkCompact(entry);
    if (entry.session.kind === "claude" && (entry.session.status === "idle" || entry.menuOpen)) void this.#checkMenu(entry);
    if (entry.session.kind === "claude" && !entry.modeCheck) {
      entry.modeCheck = setTimeout(() => void this.#checkMode(entry), MODE_CHECK_MS);
      entry.modeCheck.unref?.();
    }
  }

  async #checkMode(entry: Entry): Promise<void> {
    const mode = permissionModeOnScreen(await entry.screen.lines());
    entry.modeCheck = null;
    if (mode && this.#entries.get(entry.session.id) === entry) this.#setPermissionMode(entry, mode);
  }

  #setPermissionMode(entry: Entry, mode: string): void {
    if (mode === entry.session.permissionMode) return;
    entry.session = { ...entry.session, permissionMode: mode };
    this.#changed();
  }

  async #checkMenu(entry: Entry): Promise<void> {
    const open = terminalMenu(await entry.screen.lines()) !== null;
    const { status } = entry.session;
    if (open && status === "idle") {
      entry.menuOpen = true;
      this.#apply(entry, { event: "menu-open" });
      return;
    }
    if (!entry.menuOpen || (open && status === "waiting")) return;
    entry.menuOpen = false;
    if (status === "waiting") this.#apply(entry, { event: "menu-closed" });
  }

  async #checkInterrupt(entry: Entry): Promise<void> {
    const lines = await entry.screen.lines();
    if (entry.session.status !== "working" || !lines.some((line) => INTERRUPTED_LINE.test(line))) return;
    entry.interruptWatchUntil = 0;
    this.#apply(entry, { event: "interrupt" });
  }

  async #checkCompact(entry: Entry): Promise<void> {
    const lines = await entry.screen.lines();
    if (!entry.compacting || !compactEndedOnScreen(lines)) return;
    entry.compacting = false;
    this.#apply(entry, { event: "compact-ended" });
  }

  /**
   * Looks up the ports under every shell that is running a command. A dev server keeps listening after
   * it prints its banner, so this is polled rather than read once.
   */
  async refreshShellPorts(read?: ReadCommand): Promise<void> {
    const busy = [...this.#entries.values()].filter(
      (entry) => entry.session.shell?.running && entry.pty.pid !== undefined && entry.session.status !== "exited",
    );
    const idleWithPorts = [...this.#entries.values()].filter((entry) => !entry.session.shell?.running && (entry.session.shell?.ports.length ?? 0) > 0);
    idleWithPorts.forEach((entry) => this.#updateShell(entry, { ports: [] }));
    if (busy.length === 0) return;
    const found = await portsUnder(busy.flatMap((entry) => (entry.pty.pid === undefined ? [] : [entry.pty.pid])), read).catch((error: unknown) => {
      console.warn("[runner] shell port lookup failed", error);
      return null;
    });
    if (!found) return;
    busy.forEach((entry) => {
      const ports = (entry.pty.pid !== undefined ? found.get(entry.pty.pid) : undefined) ?? [];
      if (this.#entries.get(entry.session.id) !== entry || !entry.session.shell?.running) return;
      if (ports.join(",") !== entry.session.shell.ports.join(",")) this.#updateShell(entry, { ports });
    });
  }

  #readMarks(entry: Entry, data: string): void {
    if (!entry.markCarry && !data.includes("\x1b")) return;
    const { marks, carry } = readShellMarks(entry.markCarry, data);
    entry.markCarry = carry;
    const now = this.#options.now();
    marks.forEach((mark) => {
      const shell = entry.session.shell;
      if (!shell) return;
      if (mark.kind === "ready") this.#updateShell(entry, { integrated: true });
      else if (mark.kind === "start") this.#updateShell(entry, { integrated: true, running: { command: mark.command, since: now }, ports: [] }, now);
      else {
        const command = shell.running?.command ?? shell.lastExit?.command ?? "";
        this.#updateShell(entry, { integrated: true, running: null, lastExit: { command, code: mark.code, at: now }, ports: [] }, now);
      }
    });
  }

  #updateShell(entry: Entry, patch: Partial<NonNullable<RunnerSession["shell"]>>, updatedAt?: number): void {
    const shell = entry.session.shell;
    if (!shell) return;
    entry.session = { ...entry.session, shell: { ...shell, ...patch }, ...(updatedAt === undefined ? {} : { updatedAt }) };
    this.#changed();
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
    if (signal.event !== "menu-open" && signal.event !== "menu-closed") entry.menuOpen = false;
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
