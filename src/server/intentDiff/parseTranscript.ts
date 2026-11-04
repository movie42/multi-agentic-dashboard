import path from "node:path";
import type { LineChange, ToolEvent } from "@/common/intentDiff/types";
import { parseJson } from "./report";
import { type ContentBlock, patchResultSchema, recordSchema, type TranscriptLine, transcriptLineSchema } from "./schema";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const NARRATION_LIMIT = 1200;
const PROMPT_LIMIT = 400;
const THINKING_NARRATION_LIMIT = 500;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function promptOf(line: TranscriptLine): string | null {
  if (line.type !== "user" || line.isMeta) return null;
  const content = line.message?.content;
  let text: string | null = null;
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    if (content.some((block) => block.type === "tool_result")) return null;
    text = content
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n");
  }
  if (!text) return null;
  const trimmed = text.trim();
  const command = trimmed.match(/<command-name>([^<]+)<\/command-name>/);
  if (command) return command[1].trim();
  if (/^(<local-command|<system-reminder|<task-notification|Caveat:)/.test(trimmed)) return null;
  return trimmed.slice(0, PROMPT_LIMIT);
}

function narrationOf(block: ContentBlock): string | null {
  if (block.type === "text" && block.text?.trim()) return block.text.trim().slice(0, NARRATION_LIMIT);
  const thought = block.type === "thinking" ? block.thinking?.trim() : null;
  return thought && thought.length <= THINKING_NARRATION_LIMIT ? thought : null;
}

function linesOf(text: string): string[] {
  if (!text) return [];
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}

function recordsOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item: unknown) => {
        const parsed = recordSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
}

function changeFromPatch(hunks: { lines?: string[] }[]): LineChange {
  const added: string[] = [];
  const removed: string[] = [];
  for (const hunk of hunks) {
    for (const line of hunk.lines ?? []) {
      if (line.startsWith("+")) added.push(line.slice(1));
      else if (line.startsWith("-")) removed.push(line.slice(1));
    }
  }
  return { added, removed, precision: "exact" };
}

function changeFromInput(tool: string, input: Record<string, unknown>): LineChange {
  if (tool === "Write") return { added: linesOf(asString(input.content) ?? ""), removed: [], precision: "exact" };
  const edits = Array.isArray(input.edits) ? recordsOf(input.edits) : [input];
  const added: string[] = [];
  const removed: string[] = [];
  for (const edit of edits) {
    added.push(...linesOf(asString(edit.new_string) ?? asString(edit.new_source) ?? ""));
    removed.push(...linesOf(asString(edit.old_string) ?? ""));
  }
  return { added, removed, precision: "exact" };
}

function changeFromResult(result: unknown): LineChange | null {
  const parsed = patchResultSchema.safeParse(result);
  if (!parsed.success) return null;
  const record = parsed.data;
  if (record.structuredPatch && record.structuredPatch.length > 0) return changeFromPatch(record.structuredPatch);
  if (record.type === "create" && typeof record.content === "string") {
    return { added: linesOf(record.content), removed: [], precision: "exact" };
  }
  return null;
}

function relativeTo(roots: string[], file: string | null): string | null {
  if (!file) return null;
  for (const root of roots) {
    const relative = path.relative(root, file);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative.split(path.sep).join("/");
  }
  return null;
}

function inputTextOf(tool: string, input: Record<string, unknown>): string {
  if (tool === "Bash") return asString(input.command) ?? "";
  const edits = Array.isArray(input.edits) ? recordsOf(input.edits) : [input];
  return edits.map((edit) => asString(edit.new_string) ?? asString(edit.content) ?? "").join("\n");
}

function localCommand(command: string | null, roots: string[], local: boolean): string | null {
  if (!command || local) return command;
  return roots.some((root) => command.includes(root)) ? command : null;
}

interface TodoState {
  current: string | null;
  created: string[];
  byId: Map<string, string>;
}

function updateTodo(state: TodoState, tool: string, input: Record<string, unknown>): void {
  if (tool === "TodoWrite" && Array.isArray(input.todos)) {
    const active = recordsOf(input.todos).find((todo) => todo.status === "in_progress");
    state.current = active ? (asString(active.content) ?? asString(active.activeForm)) : null;
  } else if (tool === "TaskCreate") {
    const subject = asString(input.subject) ?? asString(input.title) ?? asString(input.description);
    if (subject) {
      state.created.push(subject);
      state.byId.set(String(state.created.length), subject);
    }
  } else if (tool === "TaskUpdate") {
    const subject = state.byId.get(String(input.taskId ?? input.id ?? ""));
    if (input.status === "in_progress" && subject) state.current = subject;
    else if ((input.status === "completed" || input.status === "deleted") && subject === state.current) state.current = null;
  }
}

export function parseTranscript(raw: string, roots: string[], local: boolean): ToolEvent[] {
  const events: ToolEvent[] = [];
  const pending = new Map<string, { event: ToolEvent; file: string | null; input: Record<string, unknown> }>();
  const todo: TodoState = { current: null, created: [], byId: new Map() };
  let sessionId = "";
  let prompt: string | null = null;
  let promptIndex = 0;
  let narration: string | null = null;
  let spokeThisTurn = false;
  let segmentId = "p0";

  for (const rawLine of raw.split("\n")) {
    if (!rawLine.startsWith("{")) continue;
    const json = parseJson(rawLine);
    if (!json.ok) continue;
    const parsed = transcriptLineSchema.safeParse(json.value);
    if (!parsed.success) continue;
    const line: TranscriptLine = parsed.data;
    if (line.sessionId) sessionId = line.sessionId;
    const at = line.timestamp ? Date.parse(line.timestamp) : 0;

    const typed = promptOf(line);
    if (typed !== null) {
      prompt = typed;
      promptIndex += 1;
      narration = null;
      spokeThisTurn = false;
      segmentId = `p${promptIndex}`;
      continue;
    }

    const content = line.message?.content;
    if (line.type === "assistant" && Array.isArray(content)) {
      for (const block of content) {
        const spoken = narrationOf(block);
        if (spoken && (block.type === "text" || !spokeThisTurn)) {
          narration = spoken;
          spokeThisTurn = block.type === "text";
          segmentId = `n:${line.uuid ?? `${promptIndex}-${events.length}`}`;
        }
        if (block.type !== "tool_use" || !block.name || !block.id) continue;
        const input = block.input ?? {};
        updateTodo(todo, block.name, input);
        const isEdit = EDIT_TOOLS.has(block.name);
        if (!isEdit && block.name !== "Bash") continue;
        const event: ToolEvent = {
          id: block.id,
          sessionId,
          at,
          tool: block.name,
          description: asString(input.description),
          narration,
          segmentId: `${sessionId}:${segmentId}`,
          prompt,
          todo: todo.current,
          command: block.name === "Bash" ? localCommand(asString(input.command), roots, local) : null,
          inputText: inputTextOf(block.name, input),
          changes: {},
        };
        events.push(event);
        const file = relativeTo(roots, asString(input.file_path) ?? asString(input.notebook_path));
        pending.set(block.id, { event, file, input });
      }
    }

    if (line.type === "user" && Array.isArray(content)) {
      for (const block of content) {
        if (block.type !== "tool_result" || !block.tool_use_id) continue;
        const entry = pending.get(block.tool_use_id);
        if (!entry) continue;
        pending.delete(block.tool_use_id);
        if (!entry.file) continue;
        const change = changeFromResult(line.toolUseResult) ?? changeFromInput(entry.event.tool, entry.input);
        entry.event.changes[entry.file] = change;
      }
    }
  }
  return events;
}
