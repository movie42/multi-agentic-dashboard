import path from "node:path";
import { z } from "zod";
import type { ActivityStep } from "@/common/sessions/types";
import { parseJson } from "@/server/shared/fallback";

export const STEP_LIMIT = 40;
const SUMMARY_CHARS = 140;
const TEXT_CHARS = 600;

const text = z.string().optional().catch(undefined);
const flag = z.boolean().optional().catch(undefined);

const contentBlockSchema = z.looseObject({
  type: text,
  id: text,
  name: text,
  text,
  input: z.record(z.string(), z.unknown()).optional().catch(undefined),
  tool_use_id: text,
  is_error: flag,
});

const transcriptLineSchema = z.looseObject({
  type: text,
  uuid: text,
  cwd: text,
  timestamp: text,
  isSidechain: flag,
  isMeta: flag,
  message: z.looseObject({ content: z.unknown().optional() }).optional().catch(undefined),
});

type ContentBlock = z.infer<typeof contentBlockSchema>;
type TranscriptLine = z.infer<typeof transcriptLineSchema>;

function blocksOf(content: unknown): ContentBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [];
  return content.flatMap((block: unknown) => {
    const parsed = contentBlockSchema.safeParse(block);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseLine(raw: string): TranscriptLine | null {
  if (!raw.startsWith("{")) return null;
  const parsed = transcriptLineSchema.safeParse(parseJson(raw));
  return parsed.success ? parsed.data : null;
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
    if (value) return clip(value.split("\n")[0] ?? value, SUMMARY_CHARS);
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
    const line = parseLine(raw);
    if (!line || line.isSidechain || line.isMeta) continue;
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
