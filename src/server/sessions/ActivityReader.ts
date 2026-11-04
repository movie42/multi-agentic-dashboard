import "server-only";
import { stat } from "node:fs/promises";
import { LRUCache } from "lru-cache";
import { stepsOf, STEP_LIMIT } from "@/server/sessions/activitySteps";
import type { ActivityStep } from "@/lib/sessions/types";
import { readTail } from "./transcriptFile";

const TAIL_BYTES = 512 * 1024;
const MAX_TAIL_BYTES = 16 * 1024 * 1024;

interface ActivityEntry {
  mtimeMs: number;
  size: number;
  steps: ActivityStep[];
}

function tailLines(text: string, size: number, bytes: number): string[] {
  const lines = text.split("\n");
  return size > bytes ? lines.slice(1) : lines;
}

export class ActivityReader {
  private readonly cache = new LRUCache<string, ActivityEntry>({ max: 500 });

  constructor(private readonly transcriptOf: (sessionId: string) => Promise<string>) {}

  async read(sessionId: string): Promise<{ steps: ActivityStep[]; updatedAt: number }> {
    const file = await this.transcriptOf(sessionId);
    const info = await stat(file);
    const cached = this.cache.get(file);
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      return { steps: cached.steps, updatedAt: info.mtimeMs };
    }
    const steps = await this.widenUntilEnough(file, info.size, TAIL_BYTES);
    this.cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, steps });
    return { steps, updatedAt: info.mtimeMs };
  }

  private async widenUntilEnough(file: string, size: number, bytes: number): Promise<ActivityStep[]> {
    const steps = stepsOf(tailLines(await readTail(file, size, bytes), size, bytes));
    const canWiden = steps.length < STEP_LIMIT && bytes < size && bytes < MAX_TAIL_BYTES;
    return canWiden ? this.widenUntilEnough(file, size, bytes * 4) : steps;
  }
}
