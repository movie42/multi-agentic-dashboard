import path from "node:path";
import type { SessionOrigin, SessionSummary, TitleSource } from "@/common/sessions/types";
import type { TranscriptEntry } from "./schema";
import { clip, flatten, humanPrompt, parseEntry, textOf } from "./transcriptText";

const TEXT_LIMIT = 800;
const RECENT_USER = 20;

export type ScannedSession = Omit<SessionSummary, "bookmark">;
export type ParsedSession = Omit<ScannedSession, "cwdExists">;

export interface SessionTitles {
  custom: string | null;
  ai: string | null;
}

export function titlesIn(lines: string[], initial: SessionTitles): SessionTitles {
  return lines
    .filter((line) => line.includes('-title"'))
    .map(parseEntry)
    .reduce<SessionTitles>(
      (titles, entry) => ({
        custom: entry?.type === "custom-title" && entry.customTitle ? entry.customTitle : titles.custom,
        ai: entry?.type === "ai-title" && entry.aiTitle ? entry.aiTitle : titles.ai,
      }),
      initial,
    );
}

function originOf(entry: TranscriptEntry): SessionOrigin {
  if (entry.entrypoint === "sdk-cli") return "headless";
  const spawned =
    entry.promptSource === "system" || /^Another Claude session sent a message/.test(textOf(entry.message?.content) ?? "");
  return spawned ? "spawned" : "human";
}

function firstAssistantText(newestFirst: TranscriptEntry[]): string | null {
  return (
    newestFirst
      .filter((entry) => entry.type === "assistant")
      .map((entry) => textOf(entry.message?.content))
      .find((text) => text !== null) ?? null
  );
}

function isUserPrompt(entry: TranscriptEntry): boolean {
  return entry.type === "user" && entry.message?.role === "user";
}

function promptText(entry: TranscriptEntry): string | null {
  const text = textOf(entry.message?.content);
  return text ? humanPrompt(text) : null;
}

interface HeadFacts {
  cwd: string | null;
  gitBranch: string | null;
  startedAt: number | null;
  firstPrompt: string | null;
  origin: SessionOrigin | null;
}

export function headFacts(lines: string[]): HeadFacts {
  const entries = lines.map(parseEntry).filter((entry): entry is TranscriptEntry => entry !== null && !entry.isSidechain);
  const users = entries.filter(isUserPrompt);
  const promptEntry = users.find((entry) => promptText(entry));
  const stopAt = (() => {
    const withCwd = entries.findIndex((entry) => entry.cwd);
    const firstPromptEntry = promptEntry ? entries.indexOf(promptEntry) : -1;
    return withCwd >= 0 && firstPromptEntry >= 0 ? Math.max(withCwd, firstPromptEntry) + 1 : entries.length;
  })();
  const scanned = entries.slice(0, stopAt);
  const timestamped = scanned.find((entry) => entry.timestamp);
  const firstUser = scanned.find(isUserPrompt);
  return {
    cwd: scanned.find((entry) => entry.cwd)?.cwd ?? null,
    gitBranch: scanned.find((entry) => entry.gitBranch)?.gitBranch ?? null,
    startedAt: timestamped?.timestamp ? Date.parse(timestamped.timestamp) : null,
    firstPrompt: promptEntry ? promptText(promptEntry) : null,
    origin: firstUser ? originOf(firstUser) : null,
  };
}

interface TailFacts {
  lastPrompt: string | null;
  lastMessage: string | null;
  gitBranch: string | null;
}

export function tailFacts(lines: string[]): TailFacts {
  const newestFirst = lines.map(parseEntry).filter((entry): entry is TranscriptEntry => entry !== null).reverse();
  const visible = newestFirst.filter((entry) => !entry.isSidechain);
  const lastPrompt =
    visible
      .map((entry) =>
        entry.type === "last-prompt" && entry.lastPrompt ? humanPrompt(entry.lastPrompt) : isUserPrompt(entry) ? promptText(entry) : null,
      )
      .find((prompt) => prompt !== null) ?? null;
  return {
    lastPrompt,
    lastMessage: firstAssistantText(visible),
    gitBranch: newestFirst.find((entry) => entry.gitBranch)?.gitBranch ?? null,
  };
}

export interface SessionSource {
  file: string;
  size: number;
  mtimeMs: number;
  head: string;
  tail: string;
}

export function summarizeSession(source: SessionSource, titles: SessionTitles): ParsedSession | null {
  const head = headFacts(source.head.split("\n"));
  const tail = tailFacts(source.tail.split("\n"));
  if (!head.firstPrompt && !tail.lastPrompt) return null;
  const titleSource: TitleSource = titles.custom ? "custom" : titles.ai ? "ai" : "none";
  const fallback = (head.firstPrompt ?? tail.lastPrompt ?? "").replace(/\s+/g, " ").slice(0, 80);
  const gitBranch = tail.gitBranch ?? head.gitBranch;
  return {
    sessionId: path.basename(source.file, ".jsonl"),
    title: titles.custom ?? titles.ai ?? fallback,
    titleSource,
    cwd: head.cwd,
    project: head.cwd ? path.basename(head.cwd) : null,
    gitBranch: gitBranch === "HEAD" ? null : gitBranch,
    firstPrompt: clip(head.firstPrompt, TEXT_LIMIT),
    lastPrompt: clip(tail.lastPrompt, TEXT_LIMIT),
    lastMessage: clip(tail.lastMessage, TEXT_LIMIT),
    startedAt: head.startedAt === null || Number.isNaN(head.startedAt) ? null : head.startedAt,
    updatedAt: source.mtimeMs,
    sizeBytes: source.size,
    origin: head.origin ?? "human",
  };
}

export interface TailEntry {
  lastAssistant: string | null;
  recentUser: string[];
}

export function locatorTail(lines: string[]): TailEntry {
  const newestFirst = lines
    .map(parseEntry)
    .filter((entry): entry is TranscriptEntry => entry !== null && !entry.isSidechain)
    .reverse();
  const recentUser = newestFirst
    .map((entry) => (entry.type === "user" ? entry.message?.content : entry.type === "queue-operation" ? entry.content : null))
    .map((prompt) => (prompt ? textOf(prompt) : null))
    .filter((text): text is string => Boolean(text))
    .slice(0, RECENT_USER)
    .map(flatten);
  return { lastAssistant: firstAssistantText(newestFirst), recentUser };
}
