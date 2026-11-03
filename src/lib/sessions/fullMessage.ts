import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR ?? path.join(homedir(), ".claude", "projects");
const TAIL_BYTES = 512 * 1024;
const CANDIDATE_FILES = 8;
const MATCH_CHARS = 60;

interface TailEntry {
  mtimeMs: number;
  lastAssistant: string | null;
}

const globalCache = globalThis as typeof globalThis & { __agentControlTails?: Map<string, TailEntry> };
globalCache.__agentControlTails ??= new Map();
const tails = globalCache.__agentControlTails;

function projectDirOf(cwd: string): string {
  return path.join(PROJECTS_DIR, cwd.replace(/[^A-Za-z0-9]/g, "-"));
}

function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function textOf(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .flatMap((block: unknown) =>
      typeof block === "object" && block !== null && "type" in block && block.type === "text" && "text" in block && typeof block.text === "string"
        ? [block.text]
        : [],
    )
    .join("\n")
    .trim();
  return text || null;
}

async function readTail(file: string, size: number): Promise<string> {
  const start = Math.max(0, size - TAIL_BYTES);
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(size - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function lastAssistantOf(file: string, size: number, mtimeMs: number): Promise<string | null> {
  const cached = tails.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached.lastAssistant;
  let lastAssistant: string | null = null;
  const lines = (await readTail(file, size)).split("\n").reverse();
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    try {
      const entry = JSON.parse(line) as { type?: string; isSidechain?: boolean; message?: { content?: unknown } };
      if (entry.type !== "assistant" || entry.isSidechain) continue;
      lastAssistant = textOf(entry.message?.content);
      if (lastAssistant) break;
    } catch {}
  }
  tails.set(file, { mtimeMs, lastAssistant });
  return lastAssistant;
}

export async function findFullMessage(cwd: string, preview: string): Promise<string | null> {
  const needle = flatten(preview).slice(0, MATCH_CHARS);
  if (needle.length < 10) return null;
  const dir = projectDirOf(cwd);
  const names = await readdir(dir).catch(() => []);
  const files = await Promise.all(
    names
      .filter((name) => name.endsWith(".jsonl"))
      .map(async (name) => {
        const file = path.join(dir, name);
        const info = await stat(file).catch(() => null);
        return info ? { file, size: info.size, mtimeMs: info.mtimeMs } : null;
      }),
  );
  const candidates = files
    .filter((entry): entry is { file: string; size: number; mtimeMs: number } => entry !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, CANDIDATE_FILES);
  for (const candidate of candidates) {
    const message = await lastAssistantOf(candidate.file, candidate.size, candidate.mtimeMs).catch(() => null);
    if (message && flatten(message).startsWith(needle)) return message;
  }
  return null;
}
