import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { saveThread } from "./askStore";
import type { AskAnchor, AskContext, AskEvent, AskThread, AskTurn } from "./types";

const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR ?? path.join(homedir(), ".claude", "projects");
const HEAD_BYTES = 64 * 1024;
const TIMEOUT_MS = 10 * 60_000;
const MAX_DIFF = 20_000;

// The desktop app starts without the login shell's PATH, so the usual install places are tried.
const CLAUDE_BIN =
  process.env.CLAUDE_BIN ??
  [path.join(homedir(), ".local", "bin", "claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find((file) =>
    existsSync(file),
  ) ??
  "claude";

// Read-only tools, and no MCP servers: connectors such as Jira or Slack can write.
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

/** The directory a session was started in, read from its transcript; null when no transcript exists. */
export async function sessionCwd(sessionId: string): Promise<string | null> {
  const dirs = await readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => []);
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const file = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`);
    if (!(await stat(file).catch(() => null))) continue;
    const handle = await open(file, "r");
    try {
      const buffer = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
      for (const line of buffer.subarray(0, bytesRead).toString("utf8").split("\n")) {
        const match = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(line);
        if (match) return JSON.parse(`"${match[1]}"`) as string;
      }
    } finally {
      await handle.close();
    }
    return null;
  }
  return null;
}

function anchorText(anchor: AskAnchor): string {
  return anchor.startLine === anchor.endLine
    ? `${anchor.file}:${anchor.startLine}`
    : `${anchor.file}:${anchor.startLine}-${anchor.endLine}`;
}

function firstPrompt(anchor: AskAnchor, context: AskContext, question: string): string {
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

export interface NewThreadInput {
  worktreePath: string;
  anchor: AskAnchor;
  context: AskContext;
  /** The session to fork; null asks a fresh session. */
  writerSessionId: string | null;
  /** Whether the reader chose a fresh session rather than having no writer. */
  chosenFresh: boolean;
  question: string;
}

export interface PreparedAsk {
  thread: AskThread;
  args: string[];
}

export async function prepareNewThread(input: NewThreadInput): Promise<PreparedAsk> {
  const writerCwd = input.writerSessionId ? await sessionCwd(input.writerSessionId) : null;
  const writer = input.writerSessionId && writerCwd ? input.writerSessionId : null;
  const now = Date.now();
  const thread: AskThread = {
    id: randomUUID(),
    worktreePath: input.worktreePath,
    anchor: input.anchor,
    label: input.context.label,
    target: writer
      ? { kind: "writer", sessionId: writer }
      : { kind: "fresh", reason: input.chosenFresh ? "chosen" : input.writerSessionId ? "writer-gone" : "no-writer" },
    // Fixed up front so the id is on record before the fork's transcript appears.
    sessionId: randomUUID(),
    cwd: writerCwd ?? input.worktreePath,
    turns: [{ question: input.question, answer: null, error: null, askedAt: now, answeredAt: null }],
    createdAt: now,
    updatedAt: now,
  };
  const prompt = firstPrompt(input.anchor, input.context, input.question);
  const resume = writer ? ["--resume", writer, "--fork-session"] : [];
  return { thread, args: ["-p", prompt, ...resume, "--session-id", thread.sessionId, ...COMMON_ARGS] };
}

export function prepareFollowUp(thread: AskThread, question: string): PreparedAsk {
  const now = Date.now();
  const turn: AskTurn = { question, answer: null, error: null, askedAt: now, answeredAt: null };
  return {
    thread: { ...thread, turns: [...thread.turns, turn], updatedAt: now },
    args: ["-p", question, "--resume", thread.sessionId, ...COMMON_ARGS],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toolLabel(block: Record<string, unknown>, cwd: string): string | null {
  if (block.type !== "tool_use" || typeof block.name !== "string") return null;
  const input = isRecord(block.input) ? block.input : {};
  const target = [input.file_path, input.pattern, input.path].find((value): value is string => typeof value === "string");
  const shown = target && path.isAbsolute(target) ? path.relative(cwd, target) || "." : target;
  return shown ? `${block.name} ${shown}` : block.name;
}

/**
 * Runs the prepared question and saves the answer into the thread's last turn. The run is not
 * tied to the page: closing it stops the stream, but the answer is still saved when it arrives.
 */
export async function runAsk(prepared: PreparedAsk, emit: (event: AskEvent) => void): Promise<void> {
  let thread = await saveThread(prepared.thread);
  emit({ type: "thread", thread });

  const outcome = await new Promise<{ answer: string | null; error: string | null }>((resolve) => {
    const child = spawn(CLAUDE_BIN, prepared.args, { cwd: thread.cwd, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    let buffer = "";
    let stderr = "";
    let result: { answer: string | null; error: string | null } | null = null;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line) continue;
        let message: unknown;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (!isRecord(message)) continue;
        if (message.type === "stream_event" && isRecord(message.event)) {
          const delta = message.event.delta;
          if (isRecord(delta) && delta.type === "text_delta" && typeof delta.text === "string") emit({ type: "text", text: delta.text });
        } else if (message.type === "assistant" && isRecord(message.message) && Array.isArray(message.message.content)) {
          for (const block of message.message.content) {
            const label = isRecord(block) ? toolLabel(block, thread.cwd) : null;
            if (label) emit({ type: "tool", label });
          }
        } else if (message.type === "result") {
          const text = typeof message.result === "string" ? message.result : "";
          result = message.is_error === true ? { answer: null, error: text || "답을 받지 못했어요" } : { answer: text, error: null };
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
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

  const turns = thread.turns.map((turn, index) =>
    index === thread.turns.length - 1 ? { ...turn, ...outcome, answeredAt: Date.now() } : turn,
  );
  thread = await saveThread({ ...thread, turns, updatedAt: Date.now() });
  emit(outcome.error ? { type: "error", error: outcome.error, thread } : { type: "done", thread });
}
