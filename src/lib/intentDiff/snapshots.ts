import { readFile } from "node:fs/promises";
import path from "node:path";
import { git, parseUnifiedDiff } from "./gitDiff";
import type { LineChange } from "./types";

/** Written by `scripts/snapshot-hook.mjs`; keep the two in sync. */
const LOG_NAME = "agent-snapshots.jsonl";
const DIFF_CONCURRENCY = 6;

export interface SnapshotRecord {
  at: number;
  sessionId: string | null;
  toolUseId: string | null;
  tool: string;
  tree: string;
}

export interface SnapshotStep {
  record: SnapshotRecord;
  previousTree: string;
  /** Repo-relative path → lines this tool call changed. */
  changes: Record<string, LineChange>;
  worktreePath: string;
}

const diffCache = new Map<string, Record<string, LineChange>>();

function isRecord(value: unknown): value is SnapshotRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.at === "number" && typeof record.tree === "string" && typeof record.tool === "string";
}

async function readLog(worktreePath: string): Promise<SnapshotRecord[]> {
  const gitDir = (await git(worktreePath, ["rev-parse", "--absolute-git-dir"]).catch(() => "")).trim();
  if (!gitDir) return [];
  const raw = await readFile(path.join(gitDir, LOG_NAME), "utf8").catch(() => "");
  const records: SnapshotRecord[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) records.push(parsed);
    } catch {}
  }
  return records;
}

async function treeChanges(worktreePath: string, from: string, to: string): Promise<Record<string, LineChange>> {
  const key = `${from}..${to}`;
  const cached = diffCache.get(key);
  if (cached) return cached;
  const output = await git(worktreePath, ["diff-tree", "-r", "-p", "-M", "--no-color", "-U0", from, to]).catch(() => "");
  const changes: Record<string, LineChange> = {};
  for (const file of parseUnifiedDiff(output)) {
    const added: string[] = [];
    const removed: string[] = [];
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.kind === "add") added.push(line.text);
        if (line.kind === "del") removed.push(line.text);
      }
    }
    changes[file.file] = { added, removed, precision: "exact" };
  }
  diffCache.set(key, changes);
  return changes;
}

async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * One step per recorded tool call inside the range. The first record in a log has no earlier
 * state to compare against, so it yields no step.
 */
export async function loadSnapshotSteps(roots: string[], since: number, until: number | null): Promise<SnapshotStep[]> {
  const pairs: { worktreePath: string; record: SnapshotRecord; previousTree: string }[] = [];
  for (const worktreePath of roots) {
    const records = await readLog(worktreePath);
    for (let index = 1; index < records.length; index++) {
      const record = records[index];
      if (record.at < since || (until !== null && record.at > until)) continue;
      pairs.push({ worktreePath, record, previousTree: records[index - 1].tree });
    }
  }
  const steps = await mapLimited(pairs, DIFF_CONCURRENCY, async (pair) => ({
    ...pair,
    changes: await treeChanges(pair.worktreePath, pair.previousTree, pair.record.tree),
  }));
  return steps.sort((a, b) => a.record.at - b.record.at);
}

export async function readAtTree(worktreePath: string, tree: string, file: string): Promise<string | null> {
  return git(worktreePath, ["show", `${tree}:${file}`]).catch(() => null);
}
