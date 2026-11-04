import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { projectDirOf } from "@/lib/sessions/fullMessage";
import type { LineChange, ToolEvent } from "./types";
import { askSessionIds } from "./askStore";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const NARRATION_LIMIT = 1200;
const PROMPT_LIMIT = 400;
const THINKING_NARRATION_LIMIT = 500;
export const UNTIL_SLACK_MS = 5 * 60_000;

interface ContentBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
}

interface TranscriptLine {
  type?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  isMeta?: boolean;
  message?: { content?: string | ContentBlock[] };
  toolUseResult?: unknown;
}

interface PatchHunk {
  lines?: string[];
}

interface CachedFile {
  mtimeMs: number;
  events: ToolEvent[];
}

const globalCache = globalThis as typeof globalThis & { __intentDiffTranscripts?: Map<string, CachedFile> };
globalCache.__intentDiffTranscripts ??= new Map();
const cache = globalCache.__intentDiffTranscripts;

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

// A progress line the agent shows the user mid-turn can be recorded as a short thinking block
// rather than a text block; long thinking stays out because it is reasoning, not a stated intent.
function narrationOf(block: ContentBlock & { thinking?: string }): string | null {
  if (block.type === "text" && block.text?.trim()) return block.text.trim().slice(0, NARRATION_LIMIT);
  const thought = block.type === "thinking" ? block.thinking?.trim() : null;
  return thought && thought.length <= THINKING_NARRATION_LIMIT ? thought : null;
}

function linesOf(text: string): string[] {
  if (!text) return [];
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}

function changeFromPatch(hunks: PatchHunk[]): LineChange {
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
  const edits = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : [input];
  const added: string[] = [];
  const removed: string[] = [];
  for (const edit of edits) {
    added.push(...linesOf(asString(edit.new_string) ?? asString(edit.new_source) ?? ""));
    removed.push(...linesOf(asString(edit.old_string) ?? ""));
  }
  return { added, removed, precision: "exact" };
}

function changeFromResult(result: unknown): LineChange | null {
  if (typeof result !== "object" || result === null) return null;
  const record = result as Record<string, unknown>;
  if (Array.isArray(record.structuredPatch) && record.structuredPatch.length > 0) {
    return changeFromPatch(record.structuredPatch as PatchHunk[]);
  }
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
  const edits = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : [input];
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
    const active = (input.todos as Record<string, unknown>[]).find((todo) => todo.status === "in_progress");
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

/**
 * `local` is false for a transcript recorded in another checkout; its shell commands only count
 * when they name one of `roots` by absolute path, since a relative path there means its own files.
 */
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
    let line: TranscriptLine;
    try {
      line = JSON.parse(rawLine) as TranscriptLine;
    } catch {
      continue;
    }
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
        // A short thinking block stands in only until the agent says something to the user.
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

async function transcriptFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(path.join(dir, entry.name));
    if (entry.isDirectory()) {
      const sub = path.join(dir, entry.name, "subagents");
      const nested = await readdir(sub).catch(() => []);
      files.push(...nested.filter((name) => name.endsWith(".jsonl")).map((name) => path.join(sub, name)));
    }
  }
  return files;
}

export interface TranscriptEvents {
  events: ToolEvent[];
  sessionCount: number;
}

/**
 * Tool calls that touched files under `roots` during the range, read from the Claude Code
 * transcripts of every checkout in `sources` (a session in one checkout can write into another).
 */
export async function loadToolEvents(
  roots: string[],
  sources: string[],
  since: number,
  until: number | null,
): Promise<TranscriptEvents> {
  const sessions = new Set<string>();
  const all: ToolEvent[] = [];
  const asked = await askSessionIds();
  for (const source of sources) {
    const local = roots.includes(source);
    for (const file of await transcriptFiles(projectDirOf(source))) {
      if (asked.has(path.basename(file, ".jsonl"))) continue;
      const info = await stat(file).catch(() => null);
      if (!info || info.mtimeMs < since) continue;
      const cacheKey = `${file}|${roots.join(",")}|${local}`;
      let cached = cache.get(cacheKey);
      if (!cached || cached.mtimeMs !== info.mtimeMs) {
        const raw = await readFile(file, "utf8").catch(() => "");
        cached = { mtimeMs: info.mtimeMs, events: parseTranscript(raw, roots, local) };
        cache.set(cacheKey, cached);
      }
      const limit = until === null ? Infinity : until + UNTIL_SLACK_MS;
      const relevant = cached.events.filter(
        (event) =>
          event.at >= since &&
          event.at <= limit &&
          (Object.keys(event.changes).length > 0 || event.command !== null),
      );
      if (relevant.length > 0) sessions.add(relevant[0].sessionId);
      all.push(...relevant);
    }
  }
  all.sort((a, b) => a.at - b.at);
  return { events: all, sessionCount: sessions.size };
}
