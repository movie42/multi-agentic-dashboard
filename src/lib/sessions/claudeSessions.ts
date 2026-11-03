import { mkdir, open, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { SessionOrigin, SessionSummary, TitleSource } from "./types";

const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR ?? path.join(homedir(), ".claude", "projects");
const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 512 * 1024;
const TEXT_LIMIT = 800;
const HOUSEKEEPING_COMMAND = /^\/(clear|compact|model|resume|exit|cost|config|status|login|logout|effort|fast|context|mcp|permissions)(\s|$)/;

type ParsedSession = Omit<SessionSummary, "cwdExists">;

const CACHE_VERSION = 3;
const CACHE_FILE = path.join(
  process.env.AGENT_CONTROL_CACHE_DIR ?? path.join(process.cwd(), ".next", "cache", "agent-control"),
  "claude-sessions.json",
);

interface CacheEntry {
  mtimeMs: number;
  size: number;
  value: ParsedSession | null;
}

interface SessionCacheState {
  entries: Map<string, CacheEntry>;
  loaded: Promise<void> | null;
  inFlight: Promise<SessionSummary[]> | null;
  persisted?: boolean;
}

const globalCache = globalThis as typeof globalThis & { __agentControlSessions?: SessionCacheState };
globalCache.__agentControlSessions ??= { entries: new Map(), loaded: null, inFlight: null };
const state = globalCache.__agentControlSessions;
const cache = state.entries;

async function loadDiskCache(): Promise<void> {
  try {
    const raw = JSON.parse(await readFile(CACHE_FILE, "utf8")) as {
      version?: number;
      entries?: [string, CacheEntry][];
    };
    if (raw.version !== CACHE_VERSION || !Array.isArray(raw.entries)) return;
    for (const [file, entry] of raw.entries) {
      if (!cache.has(file)) cache.set(file, entry);
    }
    state.persisted = true;
  } catch {}
}

async function saveDiskCache(): Promise<void> {
  try {
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify({ version: CACHE_VERSION, entries: [...cache.entries()] }));
    state.persisted = true;
  } catch (error) {
    console.warn("[sessions] could not write cache", error);
  }
}

interface TranscriptLine {
  type?: string;
  cwd?: string;
  gitBranch?: string;
  timestamp?: string;
  isSidechain?: boolean;
  entrypoint?: string;
  promptSource?: string;
  lastPrompt?: string;
  customTitle?: string;
  aiTitle?: string;
  message?: { role?: string; content?: unknown };
}

function parseLine(line: string): TranscriptLine | null {
  if (!line.startsWith("{")) return null;
  try {
    return JSON.parse(line) as TranscriptLine;
  } catch {
    return null;
  }
}

function textOf(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter(
      (block): block is { type: string; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text || null;
}

function commandPrompt(text: string): string | null {
  const name = text.match(/<command-name>([^<]+)<\/command-name>/)?.[1]?.trim();
  if (!name) return null;
  const args = text.match(/<command-args>([^<]*)<\/command-args>/)?.[1]?.trim();
  return args ? `${name} ${args}` : name;
}

function humanPrompt(text: string): string | null {
  const trimmed = text.trim();
  const command = commandPrompt(trimmed);
  if (command) return HOUSEKEEPING_COMMAND.test(command) ? null : command;
  if (/^<(local-command|system-reminder|bash-|task-notification|command-)/.test(trimmed)) return null;
  if (/^(Base directory for this skill|Caveat: The messages below)/.test(trimmed)) return null;
  return trimmed;
}

function clip(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > TEXT_LIMIT ? `${trimmed.slice(0, TEXT_LIMIT)}…` : trimmed;
}

async function readRange(file: string, start: number, length: number): Promise<string> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

export interface SessionTitles {
  custom: string | null;
  ai: string | null;
}

export async function readTitles(file: string, size: number, start = 0): Promise<SessionTitles> {
  const handle = await open(file, "r");
  let custom: string | null = null;
  let ai: string | null = null;
  try {
    const chunkSize = 4 * 1024 * 1024;
    let carry = "";
    for (let offset = start; offset < size; offset += chunkSize) {
      const buffer = Buffer.alloc(Math.min(chunkSize, size - offset));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      const text = carry + buffer.subarray(0, bytesRead).toString("utf8");
      const lastBreak = text.lastIndexOf("\n");
      const complete = lastBreak >= 0 ? text.slice(0, lastBreak) : "";
      carry = lastBreak >= 0 ? text.slice(lastBreak + 1) : text;
      if (!complete.includes('-title"')) continue;
      for (const line of complete.split("\n")) {
        if (!line.includes('-title"')) continue;
        const entry = parseLine(line);
        if (entry?.type === "custom-title" && entry.customTitle) custom = entry.customTitle;
        if (entry?.type === "ai-title" && entry.aiTitle) ai = entry.aiTitle;
      }
    }
    const tail = parseLine(carry);
    if (tail?.type === "custom-title" && tail.customTitle) custom = tail.customTitle;
    if (tail?.type === "ai-title" && tail.aiTitle) ai = tail.aiTitle;
  } finally {
    await handle.close();
  }
  return { custom, ai };
}

async function parseSession(file: string, size: number, mtimeMs: number): Promise<ParsedSession | null> {
  const head = await readRange(file, 0, Math.min(HEAD_BYTES, size));
  const tailStart = Math.max(0, size - TAIL_BYTES);
  const tail = tailStart === 0 ? head : await readRange(file, tailStart, size - tailStart);

  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let startedAt: number | null = null;
  let firstPrompt: string | null = null;
  let origin: SessionOrigin | null = null;

  for (const line of head.split("\n")) {
    const entry = parseLine(line);
    if (!entry || entry.isSidechain) continue;
    cwd ??= entry.cwd ?? null;
    gitBranch ??= entry.gitBranch ?? null;
    if (startedAt === null && entry.timestamp) startedAt = Date.parse(entry.timestamp);
    if (entry.type === "user" && entry.message?.role === "user") {
      if (origin === null) {
        origin =
          entry.entrypoint === "sdk-cli"
            ? "headless"
            : entry.promptSource === "system" || /^Another Claude session sent a message/.test(textOf(entry.message.content) ?? "")
              ? "spawned"
              : "human";
      }
      if (!firstPrompt) {
        const text = textOf(entry.message.content);
        firstPrompt = text ? humanPrompt(text) : null;
      }
    }
    if (cwd && firstPrompt) break;
  }

  let lastPrompt: string | null = null;
  let lastMessage: string | null = null;
  const tailLines = tail.split("\n").reverse();
  for (const line of tailLines) {
    const entry = parseLine(line);
    if (!entry || entry.isSidechain) continue;
    if (!lastPrompt && entry.type === "last-prompt" && entry.lastPrompt) lastPrompt = humanPrompt(entry.lastPrompt);
    if (!lastPrompt && entry.type === "user" && entry.message?.role === "user") {
      const text = textOf(entry.message.content);
      lastPrompt = text ? humanPrompt(text) : null;
    }
    if (!lastMessage && entry.type === "assistant") lastMessage = textOf(entry.message?.content);
    if (lastPrompt && lastMessage) break;
  }
  for (const line of tailLines) {
    const entry = parseLine(line);
    if (entry?.gitBranch) {
      gitBranch = entry.gitBranch;
      break;
    }
  }

  if (!firstPrompt && !lastPrompt) return null;

  const titles = await readTitles(file, size);
  const titleSource: TitleSource = titles.custom ? "custom" : titles.ai ? "ai" : "none";
  const fallback = (firstPrompt ?? lastPrompt ?? "").replace(/\s+/g, " ").slice(0, 80);

  return {
    sessionId: path.basename(file, ".jsonl"),
    title: titles.custom ?? titles.ai ?? fallback,
    titleSource,
    cwd,
    project: cwd ? path.basename(cwd) : null,
    gitBranch: gitBranch === "HEAD" ? null : gitBranch,
    firstPrompt: clip(firstPrompt),
    lastPrompt: clip(lastPrompt),
    lastMessage: clip(lastMessage),
    startedAt: Number.isNaN(startedAt) ? null : startedAt,
    updatedAt: mtimeMs,
    sizeBytes: size,
    origin: origin ?? "human",
  };
}

async function exists(target: string | null): Promise<boolean> {
  if (!target) return false;
  return stat(target).then(
    () => true,
    () => false,
  );
}

export function listClaudeSessions(): Promise<SessionSummary[]> {
  state.inFlight ??= scanSessions().finally(() => {
    state.inFlight = null;
  });
  return state.inFlight;
}

export function warmClaudeSessions(): void {
  if (cache.size === 0 && !state.inFlight) {
    listClaudeSessions().catch((error: unknown) => console.warn("[sessions] warm-up failed", error));
  }
}

async function scanSessions(): Promise<SessionSummary[]> {
  state.loaded ??= loadDiskCache();
  await state.loaded;
  let changed = false;
  const projectDirs = await readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;
    const entries = await readdir(path.join(PROJECTS_DIR, dir.name)).catch(() => []);
    for (const name of entries) {
      if (name.endsWith(".jsonl")) files.push(path.join(PROJECTS_DIR, dir.name, name));
    }
  }

  const parsed = await Promise.all(
    files.map(async (file) => {
      const info = await stat(file).catch(() => null);
      if (!info) return null;
      const cached = cache.get(file);
      if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.value;
      const value = await parseSession(file, info.size, info.mtimeMs).catch((error: unknown) => {
        console.warn("[sessions] unreadable", file, error);
        return null;
      });
      cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, value });
      changed = true;
      return value;
    }),
  );

  const present = new Set(files);
  for (const file of cache.keys()) {
    if (!present.has(file)) {
      cache.delete(file);
      changed = true;
    }
  }
  if (changed || !state.persisted) await saveDiskCache();

  const cwdExists = new Map<string, boolean>();
  const sessions: SessionSummary[] = [];
  for (const session of parsed) {
    if (!session) continue;
    if (session.cwd && !cwdExists.has(session.cwd)) cwdExists.set(session.cwd, await exists(session.cwd));
    sessions.push({
      ...session,
      cwdExists: session.cwd ? (cwdExists.get(session.cwd) ?? false) : false,
    });
  }
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}
