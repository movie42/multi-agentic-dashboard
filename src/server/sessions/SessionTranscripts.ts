import "server-only";
import { stat } from "node:fs/promises";
import path from "node:path";
import { LRUCache } from "lru-cache";
import { missingOr, type Report } from "../shared/fallback";
import { projectDirOf } from "./paths";
import { headFacts, linkRepliesIn, locatorTail } from "./summarize";
import { readLinesFrom, readRange, readTail } from "./transcriptFile";

const TAIL_BYTES = 512 * 1024;
const HEAD_BYTES = 256 * 1024;
const LINK_MESSAGE_LIMIT = 200;

export interface TranscriptFacts {
  file: string;
  size: number;
  firstPrompt: string | null;
  lastAssistant: string | null;
  /** Every reply of this conversation that may carry a link, newest first. */
  linkMessages: string[];
}

interface Cached extends TranscriptFacts {
  mtimeMs: number;
  /** Byte offset the link scan resumes from, so a growing transcript is read once. */
  scanned: number;
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
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached;
    const firstPrompt =
      cached?.firstPrompt ?? headFacts((await readRange(file, 0, Math.min(info.size, HEAD_BYTES))).split("\n")).firstPrompt;
    const { lastAssistant } = locatorTail((await readTail(file, info.size, TAIL_BYTES)).split("\n"));
    const resume = cached && info.size >= cached.scanned ? cached : null;
    const { lines, resumeAt } = await readLinesFrom(file, info.size, resume?.scanned ?? 0);
    const linkMessages = [...linkRepliesIn(lines).reverse(), ...(resume?.linkMessages ?? [])].slice(0, LINK_MESSAGE_LIMIT);
    const entry: Cached = { file, size: info.size, mtimeMs: info.mtimeMs, firstPrompt, lastAssistant, linkMessages, scanned: resumeAt };
    this.cache.set(file, entry);
    return entry;
  }
}
