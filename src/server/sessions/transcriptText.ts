import { transcriptEntrySchema, type TranscriptEntry } from "./schema";

const HOUSEKEEPING_COMMAND = /^\/(clear|compact|model|resume|exit|cost|config|status|login|logout|effort|fast|context|mcp|permissions)(\s|$)/;

export function parseEntry(line: string): TranscriptEntry | null {
  if (!line.startsWith("{")) return null;
  try {
    const parsed = transcriptEntrySchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Claude Code prints the progress note it writes between tool calls as an answer, yet records it as a
// `thinking` block. Only the opaque signature tells the two apart: its first bytes spell the block's kind.
export function isNarration(signature: unknown): boolean {
  return typeof signature === "string" && Buffer.from(signature.slice(0, 64), "base64").includes("narration");
}

function spokenText(block: unknown): string | null {
  if (typeof block !== "object" || block === null || !("type" in block)) return null;
  if (block.type === "text" && "text" in block && typeof block.text === "string") return block.text;
  if (block.type === "thinking" && "thinking" in block && typeof block.thinking === "string" && "signature" in block && isNarration(block.signature)) {
    return block.thinking;
  }
  return null;
}

export function textOf(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .flatMap((block: unknown) => spokenText(block) ?? [])
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

// Claude Code wraps text pasted into the prompt as `<pasted_content id="…">…</pasted_content id="…">`.
const PASTED = /<pasted_content id="([^"]*)">([\s\S]*?)<\/pasted_content id="\1">/g;

export function unwrapPasted(text: string): string {
  return text.replace(PASTED, (_, _id: string, body: string) => body.trim());
}

export function humanPrompt(text: string): string | null {
  const trimmed = unwrapPasted(text).trim();
  const command = commandPrompt(trimmed);
  if (command) return HOUSEKEEPING_COMMAND.test(command) ? null : command;
  if (/^<(local-command|system-reminder|bash-|task-notification|command-)/.test(trimmed)) return null;
  if (/^(Base directory for this skill|Caveat: The messages below)/.test(trimmed)) return null;
  return trimmed;
}

export function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function clip(text: string | null, limit: number): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}
