import "server-only";
import { open } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
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

export async function readTitles(file: string, size: number): Promise<SessionTitles> {
  return (await readTitlesFrom(file, size, 0)).titles;
}

/** Hands complete lines from `start` to `visit` chunk by chunk and returns the unfinished last line. */
async function scanLinesFrom(file: string, size: number, start: number, visit: (complete: string) => void): Promise<string> {
  const handle = await open(file, "r");
  try {
    const decoder = new StringDecoder("utf8");
    // eslint-disable-next-line no-restricted-syntax -- stream buffer carrying the unfinished line
    let carry = "";
    // eslint-disable-next-line no-restricted-syntax -- position loop over the file
    for (let offset = start; offset < size; offset += TITLE_CHUNK) {
      const buffer = Buffer.alloc(Math.min(TITLE_CHUNK, size - offset));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      const text = carry + decoder.write(buffer.subarray(0, bytesRead));
      const lastBreak = text.lastIndexOf("\n");
      if (lastBreak >= 0) visit(text.slice(0, lastBreak));
      carry = lastBreak >= 0 ? text.slice(lastBreak + 1) : text;
    }
    return carry + decoder.end();
  } finally {
    await handle.close();
  }
}

export async function readTitlesFrom(file: string, size: number, start: number): Promise<{ titles: SessionTitles; resumeAt: number }> {
  const titleLines: string[] = [];
  const rest = await scanLinesFrom(file, size, start, (complete) => {
    if (complete.includes('-title"')) titleLines.push(...complete.split("\n").filter((line) => line.includes('-title"')));
  });
  return { titles: titlesIn([...titleLines, rest], { custom: null, ai: null }), resumeAt: Math.max(start, size - Buffer.byteLength(rest, "utf8")) };
}

/** Complete lines from `start`; `resumeAt` is where the unfinished last line begins. */
export async function readLinesFrom(file: string, size: number, start: number): Promise<{ lines: string[]; resumeAt: number }> {
  const lines: string[] = [];
  const rest = await scanLinesFrom(file, size, start, (complete) => lines.push(...complete.split("\n")));
  return { lines, resumeAt: Math.max(start, size - Buffer.byteLength(rest, "utf8")) };
}
