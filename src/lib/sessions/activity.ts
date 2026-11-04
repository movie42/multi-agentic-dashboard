import { open, stat } from "node:fs/promises";
import path from "node:path";
import { transcriptOf } from "./sessionTitle";
import type { ActivityStep } from "./types";

const TAIL_BYTES = 512 * 1024;
const MAX_TAIL_BYTES = 16 * 1024 * 1024;
const STEP_LIMIT = 40;
const SUMMARY_CHARS = 140;
const TEXT_CHARS = 600;

interface ActivityEntry {
  mtimeMs: number;
  size: number;
  steps: ActivityStep[];
}

const globalCache = globalThis as typeof globalThis & {
  __agentControlActivity?: Map<string, ActivityEntry>;
  __agentControlTranscripts?: Map<string, string>;
};
globalCache.__agentControlActivity ??= new Map();
const activity = globalCache.__agentControlActivity;
globalCache.__agentControlTranscripts ??= new Map();
const transcripts = globalCache.__agentControlTranscripts;

interface ContentBlock {
  type?: string;
  id?: string;
  name?: string;
  text?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
}

interface TranscriptLine {
  type?: string;
  uuid?: string;
  cwd?: string;
  timestamp?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  message?: { content?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function blocksOf(content: unknown): ContentBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content.filter(isRecord) : [];
}

function clip(text: string, limit: number): string {
  const flat = text.trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

function stringField(input: Record<string, unknown> | undefined, key: string): string | null {
  const value = input?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function relativeTo(cwd: string | undefined, file: string): string {
  if (!cwd || !path.isAbsolute(file)) return file;
  const relative = path.relative(cwd, file);
  return relative.startsWith("..") ? file : relative;
}

function summaryOf(name: string, input: Record<string, unknown> | undefined, cwd: string | undefined): string | null {
  const file = stringField(input, "file_path") ?? stringField(input, "notebook_path");
  if (file) return relativeTo(cwd, file);
  for (const key of ["description", "command", "pattern", "query", "url", "skill", "prompt"]) {
    const value = stringField(input, key);
    if (value) return clip(value.split("\n")[0], SUMMARY_CHARS);
  }
  return name === "TodoWrite" ? "할 일 목록 갱신" : null;
}

// Claude Code records slash commands, hook output and reminders as user lines wrapped in tags.
function isTypedPrompt(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.startsWith("<") && !trimmed.startsWith("[Request interrupted");
}

function timeOf(line: TranscriptLine): number | null {
  const at = line.timestamp ? Date.parse(line.timestamp) : NaN;
  return Number.isNaN(at) ? null : at;
}

export function stepsOf(lines: string[]): ActivityStep[] {
  const steps: ActivityStep[] = [];
  const tools = new Map<string, Extract<ActivityStep, { kind: "tool" }>>();

  for (const raw of lines) {
    if (!raw.startsWith("{")) continue;
    let line: TranscriptLine;
    try {
      line = JSON.parse(raw) as TranscriptLine;
    } catch {
      continue;
    }
    if (line.isSidechain || line.isMeta) continue;
    const at = timeOf(line);
    const blocks = blocksOf(line.message?.content);

    if (line.type === "assistant") {
      blocks.forEach((block, index) => {
        if (block.type === "text" && block.text?.trim()) {
          steps.push({ kind: "text", id: `${line.uuid}:${index}`, at, text: clip(block.text, TEXT_CHARS) });
        } else if (block.type === "tool_use" && block.id && block.name) {
          const step: Extract<ActivityStep, { kind: "tool" }> = {
            kind: "tool",
            id: block.id,
            at,
            name: block.name,
            summary: summaryOf(block.name, block.input, line.cwd),
            detail: stringField(block.input, "command"),
            status: "running",
          };
          tools.set(block.id, step);
          steps.push(step);
        }
      });
    } else if (line.type === "user") {
      for (const block of blocks) {
        if (block.type === "tool_result" && block.tool_use_id) {
          const tool = tools.get(block.tool_use_id);
          if (tool) tool.status = block.is_error ? "error" : "ok";
        }
      }
      const typed = blocks
        .filter((block) => block.type === "text" && typeof block.text === "string" && isTypedPrompt(block.text))
        .map((block) => block.text?.trim() ?? "")
        .join("\n");
      if (typed) {
        // A new prompt means any tool still waiting for a result was cut off by the user.
        for (const tool of tools.values()) if (tool.status === "running") tool.status = "stopped";
        steps.push({ kind: "prompt", id: `${line.uuid}:prompt`, at, text: clip(typed, TEXT_CHARS) });
      }
    }
  }
  return steps.slice(-STEP_LIMIT);
}

async function readTailLines(file: string, size: number, bytes: number): Promise<string[]> {
  const start = Math.max(0, size - bytes);
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(size - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    return start > 0 ? lines.slice(1) : lines;
  } finally {
    await handle.close();
  }
}

async function fileOf(sessionId: string): Promise<string> {
  const cached = transcripts.get(sessionId);
  if (cached) return cached;
  const file = await transcriptOf(sessionId);
  transcripts.set(sessionId, file);
  return file;
}

export async function readActivity(sessionId: string): Promise<{ steps: ActivityStep[]; updatedAt: number }> {
  const file = await fileOf(sessionId);
  const info = await stat(file);
  const cached = activity.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
    return { steps: cached.steps, updatedAt: info.mtimeMs };
  }
  // An image read lands in the transcript as one base64 line that can outgrow the window, so widen until enough steps show.
  let bytes = TAIL_BYTES;
  let steps = stepsOf(await readTailLines(file, info.size, bytes));
  while (steps.length < STEP_LIMIT && bytes < info.size && bytes < MAX_TAIL_BYTES) {
    bytes *= 4;
    steps = stepsOf(await readTailLines(file, info.size, bytes));
  }
  activity.set(file, { mtimeMs: info.mtimeMs, size: info.size, steps });
  return { steps, updatedAt: info.mtimeMs };
}
