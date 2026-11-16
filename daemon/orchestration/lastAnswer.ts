import { readFile } from "node:fs/promises";

const MAX_ANSWER = 12_000;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

function clip(text: string): string {
  return text.length > MAX_ANSWER ? `${text.slice(0, MAX_ANSWER)}\n…(이하 생략)` : text;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block: unknown) => {
      const raw = record(block);
      return raw?.type === "text" && typeof raw.text === "string" ? [raw.text] : [];
    })
    .join("\n");
}

/** The last assistant turn's text in a Claude Code transcript (JSON Lines). */
export function lastAnswerInTranscript(raw: string): string | null {
  for (const untrimmed of raw.split("\n").toReversed()) {
    const line = untrimmed.trim();
    if (!line) continue;
    try {
      const entry = record(JSON.parse(line));
      if (entry?.type !== "assistant") continue;
      const text = textOf(record(entry.message)?.content).trim();
      if (text) return clip(text);
    } catch {
      continue;
    }
  }
  return null;
}

/** Reads the answer a Stop hook payload carries, falling back to its transcript file. */
export async function lastAnswerOf(body: unknown, read: (file: string) => Promise<string> = (file) => readFile(file, "utf8")): Promise<string | null> {
  const raw = record(body);
  const direct = raw?.last_assistant_message;
  if (typeof direct === "string" && direct.trim()) return clip(direct.trim());
  const transcript = raw?.transcript_path;
  if (typeof transcript !== "string" || !transcript.startsWith("/")) return null;
  try {
    return lastAnswerInTranscript(await read(transcript));
  } catch (error) {
    console.error("[runner] transcript unreadable", transcript, error);
    return null;
  }
}
