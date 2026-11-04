import "server-only";
import type { ChildProcessByStdio, SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import type { AskAnchor, AskContext, AskEvent, AskThread, AskTurn } from "@/lib/intentDiff/types";
import type { AskStore } from "./AskStore";
import { isMissing, parseJson, type Warn } from "./report";

const HEAD_BYTES = 64 * 1024;
const MAX_DIFF = 20_000;
const STDERR_TAIL = 4000;

export const DEFAULT_PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR ?? path.join(homedir(), ".claude", "projects");
export const DEFAULT_ASK_TIMEOUT_MS = 10 * 60_000;

const COMMON_ARGS = [
  "--tools",
  "Read,Grep,Glob",
  "--strict-mcp-config",
  "--mcp-config",
  '{"mcpServers":{}}',
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-partial-messages",
];

export function resolveClaudeBin(exists: (file: string) => boolean = existsSync): string {
  return (
    process.env.CLAUDE_BIN ??
    [path.join(homedir(), ".local", "bin", "claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find(exists) ??
    "claude"
  );
}

export type AskChild = ChildProcessByStdio<null, Readable, Readable>;
export type SpawnAsk = (command: string, args: string[], options: SpawnOptions & { cwd: string }) => AskChild;

export interface NewThreadInput {
  worktreePath: string;
  anchor: AskAnchor;
  context: AskContext;
  writerSessionId: string | null;
  chosenFresh: boolean;
  question: string;
}

export interface PreparedAsk {
  thread: AskThread;
  args: string[];
}

export interface AskOutcome {
  answer: string | null;
  error: string | null;
}

export type StreamItem =
  | { kind: "event"; event: AskEvent }
  | { kind: "events"; events: AskEvent[] }
  | { kind: "result"; outcome: AskOutcome }
  | { kind: "none" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function anchorText(anchor: AskAnchor): string {
  return anchor.startLine === anchor.endLine
    ? `${anchor.file}:${anchor.startLine}`
    : `${anchor.file}:${anchor.startLine}-${anchor.endLine}`;
}

export function firstPrompt(anchor: AskAnchor, context: AskContext, question: string): string {
  const diff = context.diff.length > MAX_DIFF ? `${context.diff.slice(0, MAX_DIFF)}\n… (잘림)` : context.diff;
  return [
    "diff 화면에서 코드를 리뷰하는 사람이 아래 코드에 대해 묻습니다.",
    "파일은 고치지 말고, 코드를 읽고 확인한 내용으로 답해 주세요. 이 코드를 쓴 세션이라면 그때의 의도와 이유를 함께 설명해 주세요.",
    "",
    `위치: \`${anchorText(anchor)}\` (${context.label})`,
    context.planItem ? `계획 항목: ${context.planItem.id} ${context.planItem.title}` : null,
    context.intents.length > 0 ? `의도 기록: ${context.intents.join(" / ")}` : null,
    "",
    "바뀐 줄:",
    "```diff",
    diff,
    "```",
    "",
    `질문: ${question}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function cwdFromHead(head: string): string | null {
  const match = head
    .split("\n")
    .map((line) => /"cwd":"((?:[^"\\]|\\.)*)"/.exec(line))
    .find((found) => found !== null);
  if (!match) return null;
  const decoded = parseJson(`"${match[1]}"`);
  return decoded.ok && typeof decoded.value === "string" ? decoded.value : null;
}

function toolLabel(block: Record<string, unknown>, cwd: string): string | null {
  if (block.type !== "tool_use" || typeof block.name !== "string") return null;
  const input = isRecord(block.input) ? block.input : {};
  const target = [input.file_path, input.pattern, input.path].find((value): value is string => typeof value === "string");
  const shown = target && path.isAbsolute(target) ? path.relative(cwd, target) || "." : target;
  return shown ? `${block.name} ${shown}` : block.name;
}

export function readStreamMessage(message: unknown, cwd: string): StreamItem {
  if (!isRecord(message)) return { kind: "none" };
  if (message.type === "stream_event" && isRecord(message.event)) {
    const delta = message.event.delta;
    return isRecord(delta) && delta.type === "text_delta" && typeof delta.text === "string"
      ? { kind: "event", event: { type: "text", text: delta.text } }
      : { kind: "none" };
  }
  if (message.type === "assistant" && isRecord(message.message) && Array.isArray(message.message.content)) {
    const events = message.message.content
      .map((block: unknown) => (isRecord(block) ? toolLabel(block, cwd) : null))
      .filter((label): label is string => label !== null)
      .map((label): AskEvent => ({ type: "tool", label }));
    return { kind: "events", events };
  }
  if (message.type === "result") {
    const text = typeof message.result === "string" ? message.result : "";
    return {
      kind: "result",
      outcome: message.is_error === true ? { answer: null, error: text || "답을 받지 못했어요" } : { answer: text, error: null },
    };
  }
  return { kind: "none" };
}

export interface AskRunnerDeps {
  store: AskStore;
  spawn: SpawnAsk;
  warn: Warn;
  claudeBin: string;
  projectsDir: string;
  timeoutMs: number;
  now?: () => number;
  newId?: () => string;
}

export class AskRunner {
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly deps: AskRunnerDeps) {
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? randomUUID;
  }

  async sessionCwd(sessionId: string): Promise<string | null> {
    const { projectsDir } = this.deps;
    const dirs = await readdir(projectsDir, { withFileTypes: true }).catch((error: unknown) => {
      if (!isMissing(error)) this.deps.warn("ask", error, { projectsDir });
      return [];
    });
    const candidates = dirs.filter((dir) => dir.isDirectory()).map((dir) => path.join(projectsDir, dir.name, `${sessionId}.jsonl`));
    for (const file of candidates) {
      const info = await stat(file).catch((error: unknown) => {
        if (!isMissing(error)) this.deps.warn("ask", error, { file });
        return null;
      });
      if (!info) continue;
      return this.readHeadCwd(file);
    }
    return null;
  }

  async prepareNewThread(input: NewThreadInput): Promise<PreparedAsk> {
    const writerCwd = input.writerSessionId ? await this.sessionCwd(input.writerSessionId) : null;
    const writer = input.writerSessionId && writerCwd ? input.writerSessionId : null;
    const now = this.now();
    const thread: AskThread = {
      id: this.newId(),
      worktreePath: input.worktreePath,
      anchor: input.anchor,
      label: input.context.label,
      target: writer
        ? { kind: "writer", sessionId: writer }
        : { kind: "fresh", reason: input.chosenFresh ? "chosen" : input.writerSessionId ? "writer-gone" : "no-writer" },
      sessionId: this.newId(),
      cwd: writerCwd ?? input.worktreePath,
      turns: [{ question: input.question, answer: null, error: null, askedAt: now, answeredAt: null }],
      createdAt: now,
      updatedAt: now,
    };
    const prompt = firstPrompt(input.anchor, input.context, input.question);
    const resume = writer ? ["--resume", writer, "--fork-session"] : [];
    return { thread, args: ["-p", prompt, ...resume, "--session-id", thread.sessionId, ...COMMON_ARGS] };
  }

  prepareFollowUp(thread: AskThread, question: string): PreparedAsk {
    const now = this.now();
    const turn: AskTurn = { question, answer: null, error: null, askedAt: now, answeredAt: null };
    return {
      thread: { ...thread, turns: [...thread.turns, turn], updatedAt: now },
      args: ["-p", question, "--resume", thread.sessionId, ...COMMON_ARGS],
    };
  }

  async run(prepared: PreparedAsk, emit: (event: AskEvent) => void): Promise<void> {
    const saved = await this.deps.store.save(prepared.thread);
    emit({ type: "thread", thread: saved });
    const outcome = await this.runClaude(prepared.args, saved.cwd, emit);
    const turns = saved.turns.map((turn, index) =>
      index === saved.turns.length - 1 ? { ...turn, ...outcome, answeredAt: this.now() } : turn,
    );
    const finished = await this.deps.store.save({ ...saved, turns, updatedAt: this.now() });
    emit(outcome.error ? { type: "error", error: outcome.error, thread: finished } : { type: "done", thread: finished });
  }

  private async readHeadCwd(file: string): Promise<string | null> {
    const handle = await open(file, "r");
    try {
      const buffer = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
      return cwdFromHead(buffer.subarray(0, bytesRead).toString("utf8"));
    } finally {
      await handle.close();
    }
  }

  private runClaude(args: string[], cwd: string, emit: (event: AskEvent) => void): Promise<AskOutcome> {
    return new Promise<AskOutcome>((resolve) => {
      const child = this.deps.spawn(this.deps.claudeBin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      const timer = setTimeout(() => child.kill("SIGTERM"), this.deps.timeoutMs);
      let buffer = "";
      let stderr = "";
      let result: AskOutcome | null = null;

      const handleLine = (line: string) => {
        const parsed = parseJson(line);
        if (!parsed.ok) {
          this.deps.warn("ask", parsed.error, { line: line.slice(0, 200) });
          return;
        }
        const item = readStreamMessage(parsed.value, cwd);
        if (item.kind === "event") emit(item.event);
        else if (item.kind === "events") item.events.forEach(emit);
        else if (item.kind === "result") result = item.outcome;
      };

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (line) handleLine(line);
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-STDERR_TAIL);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ answer: null, error: `claude를 실행하지 못했어요: ${error.message}` });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (result) return resolve(result);
        console.error("[ask] claude exited without a result", code, stderr);
        resolve({ answer: null, error: stderr.trim().split("\n").pop() || `claude가 답 없이 끝났어요 (코드 ${code})` });
      });
    });
  }
}
