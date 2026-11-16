import "server-only";
import { open, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SubagentRun } from "@/common/board/types";

/** A subagent whose file has not moved for this long is treated as gone, even without `finished`. */
export const SUBAGENT_STALE_MS = 10 * 60_000;
const TAIL_BYTES = 64 * 1024;
const ACTIVITY_LIMIT = 160;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function clip(value: string): string {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > ACTIVITY_LIMIT ? `${line.slice(0, ACTIVITY_LIMIT - 1)}…` : line;
}

/** The latest assistant step in a subagent transcript tail: its last tool call, or its text. */
export function latestActivity(tail: string): string | null {
  const lines = tail.split("\n").reverse();
  for (const line of lines) {
    const entry = (() => {
      try {
        return record(JSON.parse(line));
      } catch {
        return null;
      }
    })();
    const message = record(entry?.message);
    if (!entry || entry.type !== "assistant" || message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    const blocks = message.content.map(record).filter((block): block is Record<string, unknown> => block !== null);
    const tool = [...blocks].reverse().find((block) => block.type === "tool_use");
    if (tool) {
      const input = record(tool.input);
      const detail = text(input?.description) ?? text(input?.command) ?? text(input?.file_path) ?? text(input?.pattern) ?? text(input?.prompt);
      return clip(detail ? `${String(tool.name)} · ${detail}` : String(tool.name));
    }
    const said = blocks.map((block) => (block.type === "text" ? text(block.text) : null)).find(Boolean);
    if (said) return clip(said);
  }
  return null;
}

async function tailOf(file: string, size: number): Promise<string> {
  const handle = await open(file, "r");
  try {
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

/**
 * Subagents still running under a session. Claude Code keeps each one next to the session's
 * transcript as `<session>/subagents/agent-<id>.jsonl` with an `agent-<id>.meta.json` that gains
 * `finished: true` when it ends.
 */
export async function readRunningSubagents(transcriptFile: string, now: number): Promise<SubagentRun[]> {
  const dir = path.join(transcriptFile.replace(/\.jsonl$/, ""), "subagents");
  const names: string[] = await readdir(dir).catch(() => []);
  const runs = await Promise.all(
    names
      .filter((name) => name.endsWith(".meta.json"))
      .map(async (name): Promise<SubagentRun | null> => {
        const meta = record(JSON.parse(await readFile(path.join(dir, name), "utf8").catch(() => "null")));
        if (!meta || meta.finished === true) return null;
        const id = name.replace(/^agent-/, "").replace(/\.meta\.json$/, "");
        const file = path.join(dir, `agent-${id}.jsonl`);
        const info = await stat(file).catch(() => null);
        if (!info || now - info.mtimeMs > SUBAGENT_STALE_MS) return null;
        return {
          id,
          description: text(meta.description) ?? text(meta.name) ?? "서브 에이전트",
          agentType: text(meta.agentType) ?? "agent",
          activity: latestActivity(await tailOf(file, info.size)),
          updatedAt: info.mtimeMs,
        };
      }),
  );
  return runs.filter((run): run is SubagentRun => run !== null).sort((a, b) => b.updatedAt - a.updatedAt);
}
