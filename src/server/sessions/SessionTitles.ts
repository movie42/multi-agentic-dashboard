import "server-only";
import { appendFile, open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { LRUCache } from "lru-cache";
import type { SessionRef } from "@/lib/sessions/types";
import type { SessionTitles as Titles } from "./summarize";
import { readTitles } from "./transcriptFile";

interface TitleEntry extends Titles {
  size: number;
}

async function endsWithNewline(file: string): Promise<boolean> {
  const { size } = await stat(file);
  if (size === 0) return true;
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(1);
    await handle.read(buffer, 0, 1, size - 1);
    return buffer[0] === 0x0a;
  } finally {
    await handle.close();
  }
}

async function isFile(file: string): Promise<boolean> {
  return stat(file).then(
    (info) => info.isFile(),
    () => false,
  );
}

export class SessionTitles {
  private readonly titles = new LRUCache<string, TitleEntry>({ max: 5_000 });
  private readonly transcripts = new LRUCache<string, string>({ max: 5_000 });

  constructor(private readonly projectsDir: string) {}

  async refOf(file: string, size: number): Promise<SessionRef> {
    const { custom, ai } = await this.titlesOf(file, size);
    return {
      id: path.basename(file, ".jsonl"),
      title: custom ?? ai,
      titleSource: custom ? "custom" : ai ? "ai" : "none",
      bookmark: null,
    };
  }

  async transcriptOf(sessionId: string): Promise<string> {
    const dirs = await readdir(this.projectsDir, { withFileTypes: true });
    const candidates = dirs.filter((dir) => dir.isDirectory()).map((dir) => path.join(this.projectsDir, dir.name, `${sessionId}.jsonl`));
    const found = await Promise.all(candidates.map(isFile));
    const file = candidates[found.indexOf(true)];
    if (!file) throw new Error("세션 기록 파일을 찾지 못했어요");
    return file;
  }

  async cachedTranscriptOf(sessionId: string): Promise<string> {
    const cached = this.transcripts.get(sessionId);
    if (cached) return cached;
    const file = await this.transcriptOf(sessionId);
    this.transcripts.set(sessionId, file);
    return file;
  }

  async rename(sessionId: string, title: string): Promise<void> {
    const file = await this.transcriptOf(sessionId);
    const line = JSON.stringify({ type: "custom-title", customTitle: title, sessionId });
    await appendFile(file, `${(await endsWithNewline(file)) ? "" : "\n"}${line}\n`);
  }

  private async titlesOf(file: string, size: number): Promise<Titles> {
    const cached = this.titles.get(file);
    if (cached && cached.size === size) return cached;
    const resume = cached !== undefined && cached.size < size;
    const added = await readTitles(file, size, resume ? cached.size : 0);
    const entry: TitleEntry = {
      size,
      custom: added.custom ?? (resume ? cached.custom : null),
      ai: added.ai ?? (resume ? cached.ai : null),
    };
    this.titles.set(file, entry);
    return entry;
  }
}
