import path from "node:path";
import { z } from "zod";
import { parseActionText } from "@/common/a2ui/actionText";
import { surfaceIdOf, validateUiMessages } from "@/common/a2ui/messages";
import { ASK_USER_QUESTION, questionsOf } from "@/common/runner/questions";
import type { ActivityStep, ToolDocument } from "@/common/sessions/types";
import { parseJson } from "@/server/shared/fallback";
import { unwrapPasted } from "./transcriptText";

export const STEP_LIMIT = 40;
export const CHAT_LIMIT = 300;
const SUMMARY_CHARS = 140;
const TEXT_CHARS = 600;
const CHAT_TEXT_CHARS = 20_000;
const CHAT_DETAIL_CHARS = 4_000;

interface StepOptions {
  limit: number;
  textChars: number;
  detailOf: (input: Record<string, unknown> | undefined) => string | null;
  /** Keep slash commands, `!` shell commands and the output Claude Code printed for them. */
  localCommands: boolean;
  /** Draw AskUserQuestion and ExitPlanMode as their own rows instead of one-line tool rows. */
  richTools: boolean;
}

const MARKDOWN_FILE = /\.(md|mdx|markdown)$/i;

const HEREDOC_START = /<<-?\s*(['"]?)([\w.-]+)\1/;
const HEREDOC_TARGET = /(?:>|\btee\s+(?:-a\s+)?)\s*(['"]?)([^\s'";&|<>]+\.(?:md|mdx|markdown))\1/i;

/** Markdown files a shell command writes with a heredoc, such as `cat > .pr-body.tmp.md <<'EOF'` — how skills write PR bodies. */
function heredocDocuments(command: string): ToolDocument[] {
  const lines = command.split("\n");
  const documents: ToolDocument[] = [];
  // eslint-disable-next-line no-restricted-syntax -- heredoc position loop skips past each body
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index] ?? "";
    const start = header.match(HEREDOC_START);
    const target = header.match(HEREDOC_TARGET);
    if (!start?.[2]) continue;
    const delimiter = start[2];
    const end = lines.findIndex((line, at) => at > index && line.trim() === delimiter);
    if (end === -1) break;
    if (target?.[2]) documents.push({ path: target[2], content: lines.slice(index + 1, end).join("\n") });
    index = end;
  }
  return documents;
}

/** Tracks markdown files written in the session so a later Edit can show the whole file, not just the patch. */
function documentOf(name: string, input: Record<string, unknown> | undefined, files: Map<string, string>, limit: number): ToolDocument | null {
  if (name === "Bash") {
    const written = heredocDocuments(stringField(input, "command") ?? "");
    for (const document of written) files.set(document.path, document.content);
    const shown = written.at(-1);
    if (!shown) return null;
    return { path: shown.path, content: clip(shown.content, limit) };
  }
  const file = stringField(input, "file_path");
  if (!file || !MARKDOWN_FILE.test(file)) return null;
  if (name === "Write") {
    const content = typeof input?.content === "string" ? input.content : null;
    if (content === null) return null;
    files.set(file, content);
  } else if (name === "Edit") {
    const known = files.get(file);
    const before = typeof input?.old_string === "string" ? input.old_string : null;
    const after = typeof input?.new_string === "string" ? input.new_string : null;
    if (known === undefined || !before || after === null || !known.includes(before)) return null;
    files.set(file, input?.replace_all === true ? known.split(before).join(after) : known.replace(before, () => after));
  } else {
    return null;
  }
  return { path: file, content: clip(files.get(file) ?? "", limit) };
}

const EXIT_PLAN_MODE = "ExitPlanMode";
const RENDER_UI = "mcp__agent-control__render_ui";

type PendingStep = Extract<ActivityStep, { kind: "tool" | "question" | "plan" | "ui" }>;

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
  content: z.unknown().optional(),
});

const transcriptLineSchema = z.looseObject({
  type: text,
  subtype: text,
  content: z.unknown().optional(),
  uuid: text,
  cwd: text,
  timestamp: text,
  isSidechain: flag,
  isMeta: flag,
  toolUseResult: z.unknown().optional(),
  operation: text,
  attachment: z
    .looseObject({ type: text, prompt: text, commandMode: text, origin: z.looseObject({ kind: text }).optional().catch(undefined) })
    .optional()
    .catch(undefined),
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

// Terminal colour and cursor sequences that local command output carries.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

function tagged(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? (match[1] ?? "") : null;
}

type LocalItem = { kind: "prompt"; text: string } | { kind: "output"; text: string; error: boolean };

/** Reads the tag-wrapped lines Claude Code writes for commands it runs itself. */
function localItemsOf(text: string): LocalItem[] {
  const name = tagged(text, "command-name")?.trim();
  if (name) {
    const args = tagged(text, "command-args")?.trim();
    return [{ kind: "prompt", text: args ? `${name} ${args}` : name }];
  }
  const shell = tagged(text, "bash-input");
  if (shell !== null) return [{ kind: "prompt", text: `! ${shell.trim()}` }];
  const items: LocalItem[] = [];
  for (const [tag, error] of [
    ["local-command-stdout", false],
    ["local-command-stderr", true],
    ["bash-stdout", false],
    ["bash-stderr", true],
  ] as const) {
    const body = tagged(text, tag)?.replace(ANSI, "").trim();
    if (body) items.push({ kind: "output", text: body, error });
  }
  return items;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  return blocksOf(content)
    .flatMap((block) => (block.type === "text" && block.text ? [block.text] : []))
    .join("\n")
    .trim();
}

function answersOf(toolUseResult: unknown): Record<string, string> | null {
  if (typeof toolUseResult !== "object" || toolUseResult === null || !("answers" in toolUseResult)) return null;
  const { answers } = toolUseResult;
  if (typeof answers !== "object" || answers === null) return null;
  const entries = Object.entries(answers).flatMap(([key, value]: [string, unknown]) => (typeof value === "string" ? [[key, value]] : []));
  return Object.fromEntries(entries);
}

function richStepOf(block: ContentBlock & { id: string; name: string }, at: number | null, textChars: number): PendingStep | null {
  const input = block.input ?? {};
  if (block.name === ASK_USER_QUESTION) {
    const questions = questionsOf({ toolName: block.name, toolInput: input });
    return questions.length > 0 ? { kind: "question", id: block.id, at, questions, answers: null, status: "running" } : null;
  }
  if (block.name === RENDER_UI) {
    const surface = validateUiMessages(input.messages);
    const surfaceId = surface.ok ? surfaceIdOf(surface.messages) : null;
    return surface.ok && surfaceId ? { kind: "ui", id: block.id, at, surfaceId, messages: surface.messages, status: "running", action: null } : null;
  }
  const plan = block.name === EXIT_PLAN_MODE ? stringField(input, "plan") : null;
  return plan ? { kind: "plan", id: block.id, at, plan: clip(plan, textChars), status: "running", feedback: null } : null;
}

function timeOf(line: TranscriptLine): number | null {
  const at = line.timestamp ? Date.parse(line.timestamp) : NaN;
  return Number.isNaN(at) ? null : at;
}

function commandOf(input: Record<string, unknown> | undefined): string | null {
  return stringField(input, "command");
}

export function inputDetail(input: Record<string, unknown> | undefined): string | null {
  const command = stringField(input, "command");
  if (command) return clip(command, CHAT_DETAIL_CHARS);
  if (!input || Object.keys(input).length === 0) return null;
  return clip(JSON.stringify(input, null, 2), CHAT_DETAIL_CHARS);
}

export function stepsOf(lines: string[]): ActivityStep[] {
  return parseSteps(lines, { limit: STEP_LIMIT, textChars: TEXT_CHARS, detailOf: commandOf, localCommands: false, richTools: false });
}

export function chatItemsOf(lines: string[]): ActivityStep[] {
  return parseSteps(lines, { limit: CHAT_LIMIT, textChars: CHAT_TEXT_CHARS, detailOf: inputDetail, localCommands: true, richTools: true });
}

interface QueuedMessage {
  seq: number;
  at: number | null;
  text: string;
}

/**
 * Claude Code logs its input queue: `enqueue` with the text, `dequeue` (the head starts the next turn)
 * and `remove` with the text (taken in mid-turn or cleared on cancel). Replaying it leaves what still waits.
 */
function replayQueue(queue: QueuedMessage[], line: TranscriptLine, seq: number): QueuedMessage[] {
  const content = typeof line.content === "string" ? line.content : null;
  if (line.operation === "enqueue" && content !== null) return [...queue, { seq, at: timeOf(line), text: content }];
  if (line.operation === "dequeue") return queue.slice(1);
  if (line.operation === "remove") {
    const index = queue.findIndex((entry) => entry.text === content);
    return index === -1 ? queue.slice(1) : queue.filter((_, at) => at !== index);
  }
  return queue;
}

function typedText(raw: string): string | null {
  const typed = unwrapPasted(raw).trim();
  return isTypedPrompt(typed) ? typed : null;
}

function deliveredPrompt(line: TranscriptLine): string | null {
  const { attachment } = line;
  if (attachment?.type !== "queued_command" || attachment.commandMode !== "prompt" || !attachment.prompt) return null;
  if (attachment.origin && attachment.origin.kind !== "human") return null;
  return typedText(attachment.prompt);
}

/** An `[A2UI action]` reply answers the latest card with that surface id; it is shown on the card, not as a prompt. */
function claimAction(tools: Map<string, PendingStep>, text: string): boolean {
  const action = parseActionText(text);
  if (!action) return false;
  const card = [...tools.values()].reverse().find((step) => step.kind === "ui" && step.surfaceId === action.surfaceId);
  if (card?.kind !== "ui") return false;
  card.action = action;
  return true;
}

function parseSteps(lines: string[], options: StepOptions): ActivityStep[] {
  const steps: ActivityStep[] = [];
  const tools = new Map<string, PendingStep>();
  const files = new Map<string, string>();
  // eslint-disable-next-line no-restricted-syntax -- the queue is replayed line by line alongside the steps
  let queue: QueuedMessage[] = [];
  // eslint-disable-next-line no-restricted-syntax -- counts enqueues so each waiting message keeps a stable id
  let enqueued = 0;

  for (const raw of lines) {
    const line = parseLine(raw);
    if (!line || line.isSidechain || line.isMeta) continue;
    const at = timeOf(line);
    if (line.type === "queue-operation") {
      if (options.richTools) queue = replayQueue(queue, line, enqueued);
      if (line.operation === "enqueue") enqueued += 1;
      continue;
    }
    const delivered = options.richTools ? deliveredPrompt(line) : null;
    if (delivered && claimAction(tools, delivered)) continue;
    if (delivered) {
      steps.push({ kind: "prompt", id: `${line.uuid}:queued`, at, text: clip(delivered, options.textChars) });
      continue;
    }
    const blocks = blocksOf(line.message?.content ?? (line.type === "system" ? line.content : undefined));

    if (options.localCommands && (line.type === "user" || (line.type === "system" && line.subtype === "local_command"))) {
      const local = blocks.flatMap((block) => (block.type === "text" && block.text ? localItemsOf(block.text) : []));
      local.forEach((item, index) => {
        const id = `${line.uuid}:local:${index}`;
        steps.push(
          item.kind === "prompt"
            ? { kind: "prompt", id, at, text: clip(item.text, options.textChars) }
            : { kind: "output", id, at, text: clip(item.text, options.textChars), error: item.error },
        );
      });
      if (local.some((item) => item.kind === "prompt")) {
        for (const tool of tools.values()) if (tool.status === "running") tool.status = "stopped";
      }
      if (local.length > 0) continue;
    }

    if (line.type === "assistant") {
      blocks.forEach((block, index) => {
        if (block.type === "text" && block.text?.trim()) {
          steps.push({ kind: "text", id: `${line.uuid}:${index}`, at, text: clip(block.text, options.textChars) });
        } else if (block.type === "tool_use" && block.id && block.name) {
          const rich = options.richTools ? richStepOf({ ...block, id: block.id, name: block.name }, at, options.textChars) : null;
          if (rich) {
            tools.set(block.id, rich);
            steps.push(rich);
            return;
          }
          const step: Extract<ActivityStep, { kind: "tool" }> = {
            kind: "tool",
            id: block.id,
            at,
            name: block.name,
            summary: summaryOf(block.name, block.input, line.cwd),
            detail: options.detailOf(block.input),
            document: options.richTools ? documentOf(block.name, block.input, files, options.textChars) : null,
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
          if (!tool) continue;
          tool.status = block.is_error ? "error" : "ok";
          if (tool.kind === "question") tool.answers = answersOf(line.toolUseResult);
          if (tool.kind === "plan" && block.is_error) tool.feedback = clip(resultText(block.content), options.textChars) || null;
        }
      }
      const typed = blocks
        .flatMap((block) => (block.type === "text" && block.text ? [unwrapPasted(block.text).trim()] : []))
        .filter(isTypedPrompt)
        .join("\n");
      if (typed && options.richTools && claimAction(tools, typed)) continue;
      if (typed) {
        // A new prompt means any tool still waiting for a result was cut off by the user.
        for (const tool of tools.values()) if (tool.status === "running") tool.status = "stopped";
        steps.push({ kind: "prompt", id: `${line.uuid}:prompt`, at, text: clip(typed, options.textChars) });
      }
    }
  }
  const waiting = queue.flatMap((entry): ActivityStep[] => {
    const typed = typedText(entry.text);
    return typed ? [{ kind: "prompt", id: `queued:${entry.seq}`, at: entry.at, text: clip(typed, options.textChars), queued: true }] : [];
  });
  return [...steps, ...waiting].slice(-options.limit);
}
