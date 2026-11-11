import "server-only";
import { stat } from "node:fs/promises";
import { LRUCache } from "lru-cache";
import { readTail } from "./transcriptFile";

const TAIL_BYTES = 512 * 1024;
const MAX_TAIL_BYTES = 16 * 1024 * 1024;

interface TailEntry<T> {
  mtimeMs: number;
  size: number;
  items: T[];
}

interface TailParser<T> {
  parse: (lines: string[]) => T[];
  // Below this many items the tail is widened, since the cut may have dropped older ones.
  enough: number;
}

function tailLines(text: string, size: number, bytes: number): string[] {
  const lines = text.split("\n");
  return size > bytes ? lines.slice(1) : lines;
}

export class TranscriptTailReader<T> {
  private readonly cache = new LRUCache<string, TailEntry<T>>({ max: 500 });

  constructor(
    private readonly transcriptOf: (sessionId: string) => Promise<string>,
    private readonly parser: TailParser<T>,
  ) {}

  async read(sessionId: string): Promise<{ items: T[]; updatedAt: number }> {
    const file = await this.transcriptOf(sessionId);
    const info = await stat(file);
    const cached = this.cache.get(file);
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      return { items: cached.items, updatedAt: info.mtimeMs };
    }
    const items = await this.widenUntilEnough(file, info.size, TAIL_BYTES);
    this.cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, items });
    return { items, updatedAt: info.mtimeMs };
  }

  private async widenUntilEnough(file: string, size: number, bytes: number): Promise<T[]> {
    const items = this.parser.parse(tailLines(await readTail(file, size, bytes), size, bytes));
    const canWiden = items.length < this.parser.enough && bytes < size && bytes < MAX_TAIL_BYTES;
    return canWiden ? this.widenUntilEnough(file, size, bytes * 4) : items;
  }
}
