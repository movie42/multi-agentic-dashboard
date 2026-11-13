import "server-only";
import { stat } from "node:fs/promises";
import path from "node:path";
import { LRUCache } from "lru-cache";
import { missingOr, type Report } from "../shared/fallback";
import { projectDirOf } from "./paths";
import { headFacts, locatorTail } from "./summarize";
import { readRange, readTail } from "./transcriptFile";

const TAIL_BYTES = 512 * 1024;
const HEAD_BYTES = 256 * 1024;

export interface TranscriptFacts {
  file: string;
  size: number;
  firstPrompt: string | null;
  lastAssistant: string | null;
}

interface Cached extends TranscriptFacts {
  mtimeMs: number;
}

export class SessionTranscripts {
  private readonly cache = new LRUCache<string, Cached>({ max: 2_000 });

  constructor(
    private readonly projectsDir: string,
    private readonly warn: Report,
  ) {}

  async read(cwd: string, sessionId: string): Promise<TranscriptFacts | null> {
    const file = path.join(projectDirOf(this.projectsDir, cwd), `${sessionId}.jsonl`);
    const info = await stat(file).catch(missingOr(null, this.warn, "sessions", { step: "stat", file }));
    if (!info) return null;
    const cached = this.cache.get(file);
    if (cached && cached.mtimeMs === info.mtimeMs) return cached;
    const firstPrompt =
      cached?.firstPrompt ?? headFacts((await readRange(file, 0, Math.min(info.size, HEAD_BYTES))).split("\n")).firstPrompt;
    const { lastAssistant } = locatorTail((await readTail(file, info.size, TAIL_BYTES)).split("\n"));
    const entry: Cached = { file, size: info.size, mtimeMs: info.mtimeMs, firstPrompt, lastAssistant };
    this.cache.set(file, entry);
    return entry;
  }
}
