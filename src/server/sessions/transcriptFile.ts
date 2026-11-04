import "server-only";
import { open } from "node:fs/promises";
import { titlesIn, type SessionTitles } from "./summarize";

export async function readRange(file: string, start: number, length: number): Promise<string> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

export async function readTail(file: string, size: number, bytes: number): Promise<string> {
  const start = Math.max(0, size - bytes);
  return readRange(file, start, size - start);
}

const TITLE_CHUNK = 4 * 1024 * 1024;

export async function readTitles(file: string, size: number, start = 0): Promise<SessionTitles> {
  const handle = await open(file, "r");
  try {
    const offsets = Array.from({ length: Math.max(0, Math.ceil((size - start) / TITLE_CHUNK)) }, (_, index) => start + index * TITLE_CHUNK);
    const scan = await offsets.reduce<Promise<{ titles: SessionTitles; carry: string }>>(async (previous, offset) => {
      const { titles, carry } = await previous;
      const buffer = Buffer.alloc(Math.min(TITLE_CHUNK, size - offset));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      const text = carry + buffer.subarray(0, bytesRead).toString("utf8");
      const lastBreak = text.lastIndexOf("\n");
      const complete = lastBreak >= 0 ? text.slice(0, lastBreak) : "";
      const nextCarry = lastBreak >= 0 ? text.slice(lastBreak + 1) : text;
      if (!complete.includes('-title"')) return { titles, carry: nextCarry };
      return { titles: titlesIn(complete.split("\n"), titles), carry: nextCarry };
    }, Promise.resolve({ titles: { custom: null, ai: null }, carry: "" }));
    return titlesIn([scan.carry], scan.titles);
  } finally {
    await handle.close();
  }
}
