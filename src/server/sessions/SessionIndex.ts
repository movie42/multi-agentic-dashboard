import "server-only";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { LRUCache } from "lru-cache";
import { sessionCacheFileSchema, SESSION_CACHE_VERSION, type SessionCacheEntry } from "./schema";
import { summarizeSession, type ParsedSession, type ScannedSession } from "./summarize";
import { readRange, readTail, readTitles } from "./transcriptFile";
import { missingOr, parseJson, reportAnd, type Report } from "../shared/fallback";

const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 512 * 1024;
const MAX_ENTRIES = 50_000;

export interface SessionIndexOptions {
  projectsDir: string;
  cacheFile: string;
  askSessionIds: () => Promise<Set<string>>;
  warn: Report;
}

async function exists(target: string): Promise<boolean> {
  return stat(target).then(
    () => true,
    () => false,
  );
}

export async function parseSessionFile(file: string, size: number, mtimeMs: number): Promise<ParsedSession | null> {
  const head = await readRange(file, 0, Math.min(HEAD_BYTES, size));
  const tail = size <= TAIL_BYTES ? head : await readTail(file, size, TAIL_BYTES);
  return summarizeSession({ file, size, mtimeMs, head, tail }, await readTitles(file, size));
}

export class SessionIndex {
  private readonly entries = new LRUCache<string, SessionCacheEntry>({ max: MAX_ENTRIES });
  private loaded: Promise<void> | null = null;
  private inFlight: Promise<ScannedSession[]> | null = null;
  private persisted = false;

  constructor(private readonly options: SessionIndexOptions) {}

  list(): Promise<ScannedSession[]> {
    this.inFlight ??= this.scan().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  warm(): void {
    if (this.entries.size > 0 || this.inFlight) return;
    this.list().catch((error: unknown) => this.options.warn("sessions", error, { step: "warm-up" }));
  }

  private async loadDiskCache(): Promise<void> {
    const text = await readFile(this.options.cacheFile, "utf8").catch(
      missingOr(null, this.options.warn, "sessions", { step: "read cache", file: this.options.cacheFile }),
    );
    if (text === null) return;
    const parsed = sessionCacheFileSchema.safeParse(parseJson(text));
    if (!parsed.success) return;
    parsed.data.entries.filter(([file]) => !this.entries.has(file)).forEach(([file, entry]) => this.entries.set(file, entry));
    this.persisted = true;
  }

  private async saveDiskCache(): Promise<void> {
    await mkdir(path.dirname(this.options.cacheFile), { recursive: true });
    await writeFile(this.options.cacheFile, JSON.stringify({ version: SESSION_CACHE_VERSION, entries: [...this.entries.entries()] }));
    this.persisted = true;
  }

  private async transcriptFiles(): Promise<string[]> {
    const { projectsDir, warn } = this.options;
    const dirs = await readdir(projectsDir, { withFileTypes: true }).catch(
      missingOr([], warn, "sessions", { step: "list projects", projectsDir }),
    );
    const nested = await Promise.all(
      dirs
        .filter((dir) => dir.isDirectory())
        .map(async (dir) => {
          const names = await readdir(path.join(projectsDir, dir.name)).catch(
            missingOr<string[]>([], warn, "sessions", { step: "list project", dir: dir.name }),
          );
          return names.filter((name) => name.endsWith(".jsonl")).map((name) => path.join(projectsDir, dir.name, name));
        }),
    );
    return nested.flat();
  }

  private async entryFor(file: string): Promise<{ value: ParsedSession | null; changed: boolean }> {
    const info = await stat(file).catch(missingOr(null, this.options.warn, "sessions", { step: "stat", file }));
    if (!info) return { value: null, changed: false };
    const cached = this.entries.get(file);
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return { value: cached.value, changed: false };
    const value = await parseSessionFile(file, info.size, info.mtimeMs).catch(
      reportAnd(null, this.options.warn, "sessions", { step: "parse", file }),
    );
    this.entries.set(file, { mtimeMs: info.mtimeMs, size: info.size, value });
    return { value, changed: true };
  }

  private async scan(): Promise<ScannedSession[]> {
    this.loaded ??= this.loadDiskCache();
    await this.loaded;
    const files = await this.transcriptFiles();
    const results = await Promise.all(files.map((file) => this.entryFor(file)));
    const present = new Set(files);
    const gone = [...this.entries.keys()].filter((file) => !present.has(file));
    gone.forEach((file) => this.entries.delete(file));
    if (gone.length > 0 || results.some((result) => result.changed) || !this.persisted) {
      await this.saveDiskCache().catch(reportAnd(undefined, this.options.warn, "sessions", { step: "write cache" }));
    }

    const asked = await this.options.askSessionIds();
    const sessions = results
      .map((result) => result.value)
      .filter((session): session is ParsedSession => session !== null && !asked.has(session.sessionId));
    const cwds = [...new Set(sessions.flatMap((session) => (session.cwd ? [session.cwd] : [])))];
    const existing = new Map(await Promise.all(cwds.map(async (cwd) => [cwd, await exists(cwd)] as const)));
    return sessions
      .map((session) => ({ ...session, cwdExists: session.cwd ? (existing.get(session.cwd) ?? false) : false }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
}
