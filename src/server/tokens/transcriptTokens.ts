import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { addTokens, ZERO_TOKENS, type TokenCounts } from "@/common/tokens/types";
import { projectDirOf } from "@/server/sessions/paths";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

function parse(line: string): Record<string, unknown> | null {
  try {
    return record(JSON.parse(line));
  } catch {
    return null;
  }
}

/** Claude Code writes one line per content block of an assistant message, each repeating the message's usage. */
export function countTranscriptTokens(lines: readonly string[]): TokenCounts {
  const byMessage = new Map<string, TokenCounts>();
  lines.forEach((line, index) => {
    if (!line.includes('"usage"')) return;
    const entry = parse(line);
    const message = record(entry?.message);
    const usage = record(message?.usage);
    if (entry?.type !== "assistant" || !message || !usage) return;
    const key = typeof message.id === "string" && message.id ? `${message.id}:${String(entry.requestId ?? "")}` : `line:${index}`;
    byMessage.set(key, {
      input: count(usage.input_tokens),
      output: count(usage.output_tokens),
      cacheWrite: count(usage.cache_creation_input_tokens),
      cacheRead: count(usage.cache_read_input_tokens),
    });
  });
  return [...byMessage.values()].reduce(addTokens, ZERO_TOKENS);
}

async function fileTokens(file: string): Promise<TokenCounts> {
  const text = await readFile(file, "utf8").catch(() => null);
  return text === null ? ZERO_TOKENS : countTranscriptTokens(text.split("\n"));
}

async function subagentFiles(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => []);
  return names.filter((name) => name.endsWith(".jsonl")).map((name) => path.join(dir, name));
}

/** Tokens spent under each Claude Code session id, its subagents included. */
export async function sessionTokens(projectsDir: string, cwd: string, sessionIds: readonly string[]): Promise<Record<string, TokenCounts>> {
  const dir = projectDirOf(projectsDir, cwd);
  const entries = await Promise.all(
    [...new Set(sessionIds)].map(async (id) => {
      const files = [path.join(dir, `${id}.jsonl`), ...(await subagentFiles(path.join(dir, id, "subagents")))];
      const counts = (await Promise.all(files.map(fileTokens))).reduce(addTokens, ZERO_TOKENS);
      return [id, counts] as const;
    }),
  );
  return Object.fromEntries(entries);
}
