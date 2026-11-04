import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { LRUCache } from "lru-cache";
import type { ToolEvent } from "@/lib/intentDiff/types";
import { parseTranscript } from "./parseTranscript";
import { isMissing, type Warn } from "./report";

export const UNTIL_SLACK_MS = 5 * 60_000;
const CACHE_MAX = 2000;

export interface TranscriptEvents {
  events: ToolEvent[];
  sessionCount: number;
}

export interface TranscriptLoaderDeps {
  askSessionIds: () => Promise<Set<string>>;
  projectDirOf: (cwd: string) => string;
  warn: Warn;
  max?: number;
}

interface CachedFile {
  mtimeMs: number;
  events: ToolEvent[];
}

export function relevantEvents(events: ToolEvent[], since: number, until: number | null): ToolEvent[] {
  const limit = until === null ? Infinity : until + UNTIL_SLACK_MS;
  return events.filter(
    (event) => event.at >= since && event.at <= limit && (Object.keys(event.changes).length > 0 || event.command !== null),
  );
}

export class TranscriptLoader {
  private readonly cache: LRUCache<string, CachedFile>;

  constructor(private readonly deps: TranscriptLoaderDeps) {
    this.cache = new LRUCache({ max: deps.max ?? CACHE_MAX });
  }

  async load(roots: string[], sources: string[], since: number, until: number | null): Promise<TranscriptEvents> {
    const asked = await this.deps.askSessionIds();
    const perSource = await Promise.all(
      sources.map(async (source) => {
        const local = roots.includes(source);
        const files = (await this.transcriptFiles(this.deps.projectDirOf(source))).filter(
          (file) => !asked.has(path.basename(file, ".jsonl")),
        );
        const perFile = await Promise.all(files.map((file) => this.eventsOf(file, roots, local, since)));
        return perFile.map((events) => relevantEvents(events, since, until));
      }),
    );
    const groups = perSource.flat();
    const sessions = new Set(groups.filter((events) => events.length > 0).map((events) => events[0].sessionId));
    const events = groups.flat().sort((a, b) => a.at - b.at);
    return { events, sessionCount: sessions.size };
  }

  private async eventsOf(file: string, roots: string[], local: boolean, since: number): Promise<ToolEvent[]> {
    const info = await stat(file).catch((error: unknown) => {
      if (!isMissing(error)) this.deps.warn("transcripts", error, { file });
      return null;
    });
    if (!info || info.mtimeMs < since) return [];
    const key = `${file}|${roots.join(",")}|${local}`;
    const cached = this.cache.get(key);
    if (cached?.mtimeMs === info.mtimeMs) return cached.events;
    const raw = await readFile(file, "utf8").catch((error: unknown) => {
      if (!isMissing(error)) this.deps.warn("transcripts", error, { file });
      return null;
    });
    if (raw === null) return [];
    const events = parseTranscript(raw, roots, local);
    this.cache.set(key, { mtimeMs: info.mtimeMs, events });
    return events;
  }

  private async transcriptFiles(dir: string): Promise<string[]> {
    const entries = await this.listDir(dir);
    const nested = await Promise.all(
      entries.map(async (entry) => {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) return [path.join(dir, entry.name)];
        if (!entry.isDirectory()) return [];
        const sub = path.join(dir, entry.name, "subagents");
        const names = await this.listNames(sub);
        return names.filter((name) => name.endsWith(".jsonl")).map((name) => path.join(sub, name));
      }),
    );
    return nested.flat();
  }

  private listDir(dir: string) {
    return readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
      if (!isMissing(error)) this.deps.warn("transcripts", error, { dir });
      return [];
    });
  }

  private listNames(dir: string): Promise<string[]> {
    return readdir(dir).catch((error: unknown) => {
      if (!isMissing(error)) this.deps.warn("transcripts", error, { dir });
      return [];
    });
  }
}
