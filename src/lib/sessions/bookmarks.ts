import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { SessionBookmark } from "./types";

// Shared with the `sb` CLI (github.com/david-learner/session-bookmark): one JSON object per line.
const BOOKMARK_FILE =
  process.env.SB_FILE ?? path.join(homedir(), ".local", "share", "session-bookmark", "bookmarks.jsonl");
export const BOOKMARK_MEMO_LIMIT = 500;

interface BookmarkLine {
  provider: string;
  name: string;
  session_id: string;
  cwd: string;
  created_at: string;
  memo?: string;
  last_opened_at?: string;
}

function isBookmarkLine(value: unknown): value is BookmarkLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return typeof line.session_id === "string" && typeof line.name === "string";
}

async function readLines(): Promise<BookmarkLine[]> {
  const text = await readFile(BOOKMARK_FILE, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const lines: BookmarkLine[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isBookmarkLine(parsed)) lines.push(parsed);
    } catch {
      console.warn("[bookmarks] skipped a malformed line");
    }
  }
  return lines;
}

async function writeLines(lines: BookmarkLine[]): Promise<void> {
  await mkdir(path.dirname(BOOKMARK_FILE), { recursive: true });
  const tmp = `${BOOKMARK_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, lines.map((line) => `${JSON.stringify(line)}\n`).join(""));
  await rename(tmp, BOOKMARK_FILE);
}

// `sb` writes local time as "YYYY-MM-DD HH:MM".
function now(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function readBookmarks(): Promise<Map<string, SessionBookmark>> {
  const bookmarks = new Map<string, SessionBookmark>();
  for (const line of await readLines()) {
    if (line.provider !== "claude") continue;
    bookmarks.set(line.session_id, {
      name: line.name,
      memo: line.memo ?? "",
      createdAt: line.created_at,
      lastOpenedAt: line.last_opened_at ?? null,
    });
  }
  return bookmarks;
}

export async function saveBookmark(input: { sessionId: string; name: string; cwd: string; memo: string }): Promise<void> {
  const lines = await readLines();
  const existing = lines.find((line) => line.session_id === input.sessionId);
  const next: BookmarkLine = {
    provider: "claude",
    name: input.name,
    session_id: input.sessionId,
    cwd: input.cwd,
    created_at: existing?.created_at ?? now(),
    memo: input.memo,
    ...(existing?.last_opened_at ? { last_opened_at: existing.last_opened_at } : {}),
  };
  await writeLines([...lines.filter((line) => line.session_id !== input.sessionId), next]);
}

export async function removeBookmark(sessionId: string): Promise<void> {
  const lines = await readLines();
  await writeLines(lines.filter((line) => line.session_id !== sessionId));
}
