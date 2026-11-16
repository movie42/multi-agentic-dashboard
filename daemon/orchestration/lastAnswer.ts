import { open } from "node:fs/promises";

const TAIL_BYTES = 512 * 1024;
export const ANSWER_LIMIT = 6000;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

function textOf(line: string): string | null {
  try {
    const entry = record(JSON.parse(line));
    if (entry?.type !== "assistant") return null;
    const content = record(entry.message)?.content;
    if (!Array.isArray(content)) return null;
    const text = content
      .map((block) => record(block))
      .flatMap((block) => (block?.type === "text" && typeof block.text === "string" ? [block.text] : []))
      .join("\n")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

/** The last assistant text in a Claude Code transcript (JSONL), reading only the file's tail. */
export function lastAnswerOf(jsonl: string): string | null {
  const lines = jsonl.split("\n");
  // eslint-disable-next-line no-restricted-syntax -- position loop from the end
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const text = textOf(lines[index] ?? "");
    if (text) return text;
  }
  return null;
}

export function clip(text: string, limit = ANSWER_LIMIT): string {
  return text.length > limit ? `${text.slice(0, limit)}\n…(뒷부분 생략)` : text;
}

export async function readLastAnswer(transcriptPath: string): Promise<string | null> {
  const handle = await open(transcriptPath, "r");
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return lastAnswerOf(buffer.toString("utf8"));
  } finally {
    await handle.close();
  }
}
