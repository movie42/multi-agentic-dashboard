import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { AskThread } from "./types";

const ASK_FILE =
  process.env.AGENT_CONTROL_ASK_FILE ?? path.join(homedir(), ".local", "share", "agent-control", "ask-threads.json");

interface StoreFile {
  threads: AskThread[];
}

const globalCache = globalThis as typeof globalThis & {
  __askStoreQueue?: Promise<unknown>;
  __askSessionIds?: { mtimeMs: number; ids: Set<string> };
};

async function readStore(): Promise<StoreFile> {
  const text = await readFile(ASK_FILE, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (text === null) return { threads: [] };
  const parsed: unknown = JSON.parse(text);
  const threads = typeof parsed === "object" && parsed !== null && "threads" in parsed ? parsed.threads : null;
  return { threads: Array.isArray(threads) ? (threads as AskThread[]) : [] };
}

/** Writes go one at a time so two answers finishing together do not drop each other. */
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = (globalCache.__askStoreQueue ?? Promise.resolve()).then(work, work);
  globalCache.__askStoreQueue = next.catch(() => undefined);
  return next;
}

export async function listThreads(worktreePath: string): Promise<AskThread[]> {
  const { threads } = await readStore();
  return threads.filter((thread) => thread.worktreePath === worktreePath);
}

export async function getThread(id: string): Promise<AskThread | null> {
  const { threads } = await readStore();
  return threads.find((thread) => thread.id === id) ?? null;
}

export function saveThread(thread: AskThread): Promise<AskThread> {
  return serialized(async () => {
    const store = await readStore();
    const index = store.threads.findIndex((item) => item.id === thread.id);
    if (index >= 0) store.threads[index] = thread;
    else store.threads.push(thread);
    await mkdir(path.dirname(ASK_FILE), { recursive: true });
    const temp = `${ASK_FILE}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(store, null, 2));
    await rename(temp, ASK_FILE);
    return thread;
  });
}

/**
 * Sessions created to answer questions. A fork carries a copy of the original session's edits,
 * so transcript readers skip these or the same edit would be counted twice.
 */
export async function askSessionIds(): Promise<Set<string>> {
  const info = await stat(ASK_FILE).catch(() => null);
  if (!info) return new Set();
  const cached = globalCache.__askSessionIds;
  if (cached?.mtimeMs === info.mtimeMs) return cached.ids;
  const { threads } = await readStore().catch(() => ({ threads: [] as AskThread[] }));
  const ids = new Set(threads.map((thread) => thread.sessionId));
  globalCache.__askSessionIds = { mtimeMs: info.mtimeMs, ids };
  return ids;
}
