import "server-only";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { AskThread } from "@/common/intentDiff/types";
import { isMissing, type Warn } from "./report";
import { askStoreFileSchema, askThreadSchema } from "./schema";

export const DEFAULT_ASK_FILE =
  process.env.AGENT_CONTROL_ASK_FILE ?? path.join(homedir(), ".local", "share", "agent-control", "ask-threads.json");

export function threadsOf(parsed: unknown, warn: Warn, file: string): AskThread[] {
  const store = askStoreFileSchema.safeParse(parsed);
  if (!store.success) {
    warn("ask-store", store.error, { file });
    return [];
  }
  return store.data.threads.flatMap((raw, index) => {
    const thread = askThreadSchema.safeParse(raw);
    if (thread.success) return [thread.data];
    warn("ask-store", thread.error, { file, index });
    return [];
  });
}

export class AskStore {
  private queue: Promise<unknown> = Promise.resolve();
  private sessionIdCache: { mtimeMs: number; ids: Set<string> } | null = null;

  constructor(
    private readonly file: string,
    private readonly warn: Warn,
    private readonly pid: number = process.pid,
  ) {}

  async list(worktreePath: string): Promise<AskThread[]> {
    const threads = await this.read();
    return threads.filter((thread) => thread.worktreePath === worktreePath);
  }

  async get(id: string): Promise<AskThread | null> {
    const threads = await this.read();
    return threads.find((thread) => thread.id === id) ?? null;
  }

  save(thread: AskThread): Promise<AskThread> {
    return this.serialized(async () => {
      const current = await this.read();
      const exists = current.some((item) => item.id === thread.id);
      await this.write(exists ? current.map((item) => (item.id === thread.id ? thread : item)) : [...current, thread]);
      return thread;
    });
  }

  /** Rewrites the named threads in one write; ids that are gone are skipped. */
  update(ids: string[], change: (thread: AskThread) => AskThread): Promise<AskThread[]> {
    return this.serialized(async () => {
      const wanted = new Set(ids);
      const current = await this.read();
      const threads = current.map((thread) => (wanted.has(thread.id) ? change(thread) : thread));
      await this.write(threads);
      return threads.filter((thread) => wanted.has(thread.id));
    });
  }

  private async write(threads: AskThread[]): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${this.pid}.tmp`;
    await writeFile(temp, JSON.stringify({ threads }, null, 2));
    await rename(temp, this.file);
  }

  async sessionIds(): Promise<Set<string>> {
    const info = await stat(this.file).catch((error: unknown) => {
      if (!isMissing(error)) this.warn("ask-store", error, { file: this.file });
      return null;
    });
    if (!info) return new Set();
    if (this.sessionIdCache?.mtimeMs === info.mtimeMs) return this.sessionIdCache.ids;
    const threads = await this.read().catch((error: unknown) => {
      this.warn("ask-store", error, { file: this.file });
      return [];
    });
    const ids = new Set(threads.map((thread) => thread.sessionId));
    this.sessionIdCache = { mtimeMs: info.mtimeMs, ids };
    return ids;
  }

  private async read(): Promise<AskThread[]> {
    const text = await readFile(this.file, "utf8").catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (text === null) return [];
    return threadsOf(JSON.parse(text), this.warn, this.file);
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch((error: unknown) => {
      this.warn("ask-store", error, { file: this.file });
    });
    return next;
  }
}
