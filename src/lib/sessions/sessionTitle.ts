import { appendFile, open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { readTitles, type SessionTitles } from "./claudeSessions";
import type { SessionRef } from "./types";

const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR ?? path.join(homedir(), ".claude", "projects");
export { TITLE_LIMIT } from "@/common/sessions/limits";

interface TitleEntry extends SessionTitles {
  size: number;
}

const globalCache = globalThis as typeof globalThis & { __agentControlTitles?: Map<string, TitleEntry> };
globalCache.__agentControlTitles ??= new Map();
const titles = globalCache.__agentControlTitles;

// Transcripts are append-only, so only the bytes added since the last read are scanned.
async function titlesOf(file: string, size: number): Promise<SessionTitles> {
  const cached = titles.get(file);
  if (cached && cached.size === size) return cached;
  const resume = cached && cached.size < size;
  const added = await readTitles(file, size, resume ? cached.size : 0);
  const entry: TitleEntry = {
    size,
    custom: added.custom ?? (resume ? cached.custom : null),
    ai: added.ai ?? (resume ? cached.ai : null),
  };
  titles.set(file, entry);
  return entry;
}

export async function sessionRefOf(file: string, size: number): Promise<SessionRef> {
  const { custom, ai } = await titlesOf(file, size);
  return {
    id: path.basename(file, ".jsonl"),
    title: custom ?? ai,
    titleSource: custom ? "custom" : ai ? "ai" : "none",
    bookmark: null,
  };
}

export async function transcriptOf(sessionId: string): Promise<string> {
  const dirs = await readdir(PROJECTS_DIR, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const file = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`);
    if (await stat(file).then((info) => info.isFile(), () => false)) return file;
  }
  throw new Error("세션 기록 파일을 찾지 못했어요");
}

// Same line Claude Code's /rename appends, so `claude --resume` shows the title too.
export async function renameSession(sessionId: string, title: string): Promise<void> {
  const file = await transcriptOf(sessionId);
  const line = JSON.stringify({ type: "custom-title", customTitle: title, sessionId });
  await appendFile(file, `${(await endsWithNewline(file)) ? "" : "\n"}${line}\n`);
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
