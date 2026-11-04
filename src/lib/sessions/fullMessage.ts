import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR ?? path.join(homedir(), ".claude", "projects");
const TAIL_BYTES = 512 * 1024;
const CANDIDATE_FILES = 8;
const MATCH_CHARS = 60;
const RECENT_USER = 20;

interface TailEntry {
  mtimeMs: number;
  lastAssistant: string | null;
  recentUser: string[];
}

export interface LocatedSession {
  file: string;
  size: number;
  lastAssistant: string | null;
}

const globalCache = globalThis as typeof globalThis & {
  __agentControlTails?: Map<string, TailEntry>;
  __agentControlPaneFiles?: Map<string, string>;
};
globalCache.__agentControlTails ??= new Map();
const tails = globalCache.__agentControlTails;
globalCache.__agentControlPaneFiles ??= new Map();
const paneFiles = globalCache.__agentControlPaneFiles;

export function projectDirOf(cwd: string): string {
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

async function tailOf(file: string, size: number, mtimeMs: number): Promise<TailEntry> {
  const cached = tails.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached;
  let lastAssistant: string | null = null;
  const recentUser: string[] = [];
  const lines = (await readTail(file, size)).split("\n").reverse();
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    try {
      const entry = JSON.parse(line) as {
        type?: string;
        isSidechain?: boolean;
        content?: unknown;
        message?: { content?: unknown };
      };
      if (entry.isSidechain) continue;
      if (entry.type === "assistant" && !lastAssistant) lastAssistant = textOf(entry.message?.content);
      // Prompts typed while the agent is mid-turn are recorded as queue-operation lines.
      const prompt = entry.type === "user" ? entry.message?.content : entry.type === "queue-operation" ? entry.content : null;
      if (prompt && recentUser.length < RECENT_USER) {
        const text = textOf(prompt);
        if (text) recentUser.push(flatten(text));
      }
      if (lastAssistant && recentUser.length >= RECENT_USER) break;
    } catch {}
  }
  const entry = { mtimeMs, lastAssistant, recentUser };
  tails.set(file, entry);
  return entry;
}

function needleOf(text: string | null): string | null {
  const needle = text ? flatten(text).slice(0, MATCH_CHARS) : "";
  return needle.length >= 10 ? needle : null;
}

// Orca reports a live pane's last reply and prompt but not its Claude session id,
// so the transcript is found by matching those texts against recent files in the worktree.
// A pane keeps its last matched transcript, because a long turn can push both texts out of the tail read.
export async function findSession(
  paneKey: string,
  cwd: string,
  preview: string | null,
  prompt: string | null,
): Promise<LocatedSession | null> {
  const located = await matchSession(cwd, preview, prompt);
  if (located) {
    paneFiles.set(paneKey, located.file);
    return located;
  }
  const remembered = paneFiles.get(paneKey);
  const info = remembered ? await stat(remembered).catch(() => null) : null;
  if (!remembered || !info) return null;
  const tail = await tailOf(remembered, info.size, info.mtimeMs).catch(() => null);
  return { file: remembered, size: info.size, lastAssistant: tail?.lastAssistant ?? null };
}

async function matchSession(cwd: string, preview: string | null, prompt: string | null): Promise<LocatedSession | null> {
  const replyNeedle = needleOf(preview);
  const promptNeedle = needleOf(prompt);
  if (!replyNeedle && !promptNeedle) return null;
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
  const tailsOf = await Promise.all(
    candidates.map((candidate) => tailOf(candidate.file, candidate.size, candidate.mtimeMs).catch(() => null)),
  );
  const pick = (index: number): LocatedSession => ({
    file: candidates[index].file,
    size: candidates[index].size,
    lastAssistant: tailsOf[index]?.lastAssistant ?? null,
  });
  if (replyNeedle) {
    const index = tailsOf.findIndex((tail) => tail?.lastAssistant && flatten(tail.lastAssistant).startsWith(replyNeedle));
    if (index >= 0) return pick(index);
  }
  if (promptNeedle) {
    const index = tailsOf.findIndex((tail) => tail?.recentUser.some((text) => text.includes(promptNeedle)));
    if (index >= 0) return pick(index);
  }
  return null;
}
