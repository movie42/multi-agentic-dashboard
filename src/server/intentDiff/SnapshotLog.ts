import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LRUCache } from "lru-cache";
import { parseUnifiedDiff } from "@/server/intentDiff/gitDiff";
import type { LineChange } from "@/common/intentDiff/types";
import { isMissing, parseJson, type Warn } from "./report";
import { type SnapshotRecord, snapshotRecordSchema } from "./schema";

export const SNAPSHOT_LOG_NAME = "agent-snapshots.jsonl";
const DIFF_CONCURRENCY = 6;
const DIFF_CACHE_MAX = 4000;

export type GitRun = (cwd: string, args: string[]) => Promise<string>;

export interface SnapshotStep {
  record: SnapshotRecord;
  previousTree: string;
  changes: Record<string, LineChange>;
  worktreePath: string;
}

export function parseSnapshotLog(raw: string): { records: SnapshotRecord[]; invalid: number } {
  const lines = raw.split("\n").filter((line) => line.trim());
  const records = lines.flatMap((line) => {
    const json = parseJson(line);
    if (!json.ok) return [];
    const record = snapshotRecordSchema.safeParse(json.value);
    return record.success ? [record.data] : [];
  });
  return { records, invalid: lines.length - records.length };
}

export function changesFromDiff(output: string): Record<string, LineChange> {
  return Object.fromEntries(
    parseUnifiedDiff(output).map((file) => {
      const lines = file.hunks.flatMap((hunk) => hunk.lines);
      const change: LineChange = {
        added: lines.filter((line) => line.kind === "add").map((line) => line.text),
        removed: lines.filter((line) => line.kind === "del").map((line) => line.text),
        precision: "exact",
      };
      return [file.file, change];
    }),
  );
}

export async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const queue = items.entries();
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (const [index, item] of queue) {
      results[index] = await run(item);
    }
  });
  await Promise.all(workers);
  return results;
}

export class SnapshotLog {
  private readonly diffs: LRUCache<string, Record<string, LineChange>>;

  constructor(
    private readonly git: GitRun,
    private readonly warn: Warn,
    maxDiffs: number = DIFF_CACHE_MAX,
  ) {
    this.diffs = new LRUCache({ max: maxDiffs });
  }

  async loadSteps(roots: string[], since: number, until: number | null): Promise<SnapshotStep[]> {
    const logs = await Promise.all(roots.map(async (worktreePath) => ({ worktreePath, records: await this.readLog(worktreePath) })));
    const pairs = logs.flatMap(({ worktreePath, records }) =>
      records.slice(1).flatMap((record, index) => {
        const previous = records[index];
        return !previous || record.at < since || (until !== null && record.at > until)
          ? []
          : [{ worktreePath, record, previousTree: previous.tree }];
      }),
    );
    const steps = await mapLimited(pairs, DIFF_CONCURRENCY, async (pair) => ({
      ...pair,
      changes: await this.treeChanges(pair.worktreePath, pair.previousTree, pair.record.tree),
    }));
    return steps.sort((a, b) => a.record.at - b.record.at);
  }

  async readAtTree(worktreePath: string, tree: string, file: string): Promise<string | null> {
    return this.git(worktreePath, ["show", `${tree}:${file}`]).catch((error: unknown) => {
      if (!isMissingPath(error)) this.warn("snapshots", error, { worktreePath, tree, file });
      return null;
    });
  }

  private async readLog(worktreePath: string): Promise<SnapshotRecord[]> {
    const gitDir = await this.git(worktreePath, ["rev-parse", "--absolute-git-dir"]).then(
      (output) => output.trim(),
      (error: unknown) => {
        this.warn("snapshots", error, { worktreePath });
        return "";
      },
    );
    if (!gitDir) return [];
    const file = path.join(gitDir, SNAPSHOT_LOG_NAME);
    const raw = await readFile(file, "utf8").catch((error: unknown) => {
      if (!isMissing(error)) this.warn("snapshots", error, { file });
      return "";
    });
    const { records, invalid } = parseSnapshotLog(raw);
    if (invalid > 0) this.warn("snapshots", new Error(`${invalid} unreadable snapshot lines`), { file });
    return records;
  }

  private async treeChanges(worktreePath: string, from: string, to: string): Promise<Record<string, LineChange>> {
    const key = `${from}..${to}`;
    const cached = this.diffs.get(key);
    if (cached) return cached;
    const output = await this.git(worktreePath, ["diff-tree", "-r", "-p", "-M", "--no-color", "-U0", from, to]).catch(
      (error: unknown) => {
        this.warn("snapshots", error, { worktreePath, from, to });
        return null;
      },
    );
    if (output === null) return {};
    const changes = changesFromDiff(output);
    this.diffs.set(key, changes);
    return changes;
  }
}

function isMissingPath(error: unknown): boolean {
  const stderr = typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr) : "";
  return /does not exist in|exists on disk, but not in/.test(stderr);
}
