import "server-only";
import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_LOG_FILE =
  process.env.AGENT_CONTROL_LOG_FILE ?? path.join(homedir(), "Library", "Logs", "agent-control", "app.log");
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export interface ErrorEntry {
  at: string;
  level: "error" | "warn";
  scope: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
}

export function describeError(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) return { message: error.message, stack: error.stack ?? null };
  if (typeof error === "string") return { message: error, stack: null };
  return { message: JSON.stringify(error) ?? String(error), stack: null };
}

export class ErrorLog {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string = DEFAULT_LOG_FILE,
    private readonly maxBytes: number = DEFAULT_MAX_BYTES,
    private readonly now: () => Date = () => new Date(),
  ) {}

  record(level: ErrorEntry["level"], scope: string, error: unknown, context: Record<string, unknown> = {}): ErrorEntry {
    const entry: ErrorEntry = { at: this.now().toISOString(), level, scope, ...describeError(error), context };
    (level === "error" ? console.error : console.warn)(`[${scope}]`, entry.message, context, error);
    this.queue = this.queue.then(() => this.append(entry)).catch((writeError: unknown) => {
      console.error("[error-log] write failed", this.file, writeError);
    });
    return entry;
  }

  flush(): Promise<void> {
    return this.queue;
  }

  private async append(entry: ErrorEntry): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const size = await stat(this.file).then(
      (info) => info.size,
      () => 0,
    );
    if (size >= this.maxBytes) await rename(this.file, `${this.file}.1`);
    await appendFile(this.file, `${JSON.stringify(entry)}\n`);
  }
}
