import "server-only";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { UsageSnapshot, UsageWindow } from "@/common/usage/types";
import { USAGE_FILE } from "../projects/paths";
import { UsageApi } from "./UsageApi";

const SAVED_STALE_MS = 10 * 60_000;

const windowSchema = z.object({ percent: z.number(), resetsAt: z.string().nullable() }).nullable().catch(null);

const usageFileSchema = z.object({ session: windowSchema, weekly: windowSchema, receivedAt: z.number() });

type SavedUsage = z.infer<typeof usageFileSchema>;

interface UsageSource {
  read: () => Promise<SavedUsage>;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function hasReset(window: UsageWindow | null, now: number): boolean {
  return window?.resetsAt != null && new Date(window.resetsAt).getTime() <= now;
}

export class UsageReader {
  constructor(
    private readonly file: string = USAGE_FILE,
    private readonly api: UsageSource = new UsageApi(),
    private readonly now: () => number = Date.now,
  ) {}

  async read(): Promise<UsageSnapshot> {
    const saved = await this.readSaved();
    if (saved && this.isCurrent(saved)) return { ...saved, source: "statusline" };
    try {
      const fetched = await this.api.read();
      if (saved && saved.receivedAt > fetched.receivedAt) return { ...saved, source: "statusline" };
      return { ...fetched, source: "api" };
    } catch (error) {
      if (saved) return { ...saved, source: "statusline" };
      throw error;
    }
  }

  private isCurrent(saved: SavedUsage): boolean {
    const now = this.now();
    if (now - saved.receivedAt >= SAVED_STALE_MS) return false;
    return !hasReset(saved.session, now) && !hasReset(saved.weekly, now);
  }

  private async readSaved(): Promise<SavedUsage | null> {
    const raw = await readFile(this.file, "utf8").catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (raw === null) return null;
    const parsed = usageFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error("사용량 파일을 읽지 못했어요");
    return parsed.data;
  }
}
