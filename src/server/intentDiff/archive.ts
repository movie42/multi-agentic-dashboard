import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { git } from "@/server/intentDiff/gitDiff";
import { UNTIL_SLACK_MS } from "@/server/intentDiff/TranscriptLoader";
import { z } from "zod";
import type { DiffRange, ToolEvent } from "@/common/intentDiff/types";
import { parseJson } from "@/server/shared/fallback";

// Claude Code deletes transcripts after `cleanupPeriodDays`, `git worktree remove` deletes the
// snapshot log, and `git gc` prunes the unreferenced snapshot trees. The archive keeps what was
// read from them, outside the repository, so a diff can still be attributed afterwards.
const ARCHIVE_DIR = process.env.INTENT_DIFF_ARCHIVE_DIR ?? path.join(homedir(), ".local", "share", "agent-control", "intent-diff");
const VERSION = 1;

const lineChangeSchema = z.object({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  precision: z.enum(["exact", "file"]),
});

const toolEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  at: z.number(),
  tool: z.string(),
  description: z.string().nullable(),
  narration: z.string().nullable(),
  segmentId: z.string(),
  prompt: z.string().nullable(),
  todo: z.string().nullable(),
  command: z.string().nullable(),
  inputText: z.string(),
  changes: z.record(z.string(), lineChangeSchema),
});

const archivedEventSchema = z.object({ event: toolEventSchema, local: z.string().nullable() });

const archiveFileSchema = z.looseObject({
  version: z.literal(VERSION),
  repo: z.string(),
  events: z.record(z.string(), z.unknown()),
  completions: z.record(z.string(), z.record(z.string(), z.number())).catch({}),
});

interface ArchiveFile {
  version: number;
  repo: string;
  events: Record<string, z.infer<typeof archivedEventSchema>>;
  completions: Record<string, Record<string, number>>;
}

function validEvents(raw: Record<string, unknown>): ArchiveFile["events"] {
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const parsed = archivedEventSchema.safeParse(value);
      return parsed.success ? [[key, parsed.data] as const] : [];
    }),
  );
}

export interface ArchiveMerge {
  events: ToolEvent[];
  completions: Map<string, number>;
  /** Events that came only from the archive. */
  restored: number;
}

async function archivePath(worktreePath: string): Promise<{ file: string; repo: string } | null> {
  const common = (await git(worktreePath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).catch(() => "")).trim();
  if (!common) return null;
  const repo = path.basename(common) === ".git" ? path.dirname(common) : common;
  const hash = createHash("sha1").update(repo).digest("hex").slice(0, 8);
  return { file: path.join(ARCHIVE_DIR, `${path.basename(repo)}-${hash}.json`), repo };
}

async function readArchive(file: string, repo: string): Promise<ArchiveFile> {
  const empty: ArchiveFile = { version: VERSION, repo, events: {}, completions: {} };
  const raw = await readFile(file, "utf8").catch(() => null);
  if (!raw) return empty;
  const parsed = archiveFileSchema.safeParse(parseJson(raw));
  if (parsed.success) return { ...parsed.data, events: validEvents(parsed.data.events) };
  console.warn("[intent-diff] archive unreadable, starting over", file, parsed.error.message);
  return empty;
}

function hasChanges(event: ToolEvent): boolean {
  return Object.keys(event.changes).length > 0;
}

function inRange(event: ToolEvent, range: DiffRange): boolean {
  const limit = range.until === null ? Infinity : range.until + UNTIL_SLACK_MS;
  return event.at >= range.since && event.at <= limit;
}

/**
 * Adds archived events and completion times the live sources no longer hold, then stores what the
 * live sources gave so the next read has it. Archived calls go in before `withSnapshots`, so a
 * snapshot whose transcript is gone still attaches to its call by `toolUseId`. A call keeps its
 * archived lines when its live ones are gone (snapshot tree pruned).
 */
export async function mergeArchive(
  range: DiffRange,
  transcript: ToolEvent[],
  withSnapshots: (events: ToolEvent[]) => ToolEvent[],
  taskFile: string | null,
  completionsOf: (events: ToolEvent[]) => Promise<Map<string, number>>,
): Promise<ArchiveMerge> {
  const location = await archivePath(range.worktreePath);
  if (!location) {
    const events = withSnapshots(transcript);
    return { events, completions: await completionsOf(events), restored: 0 };
  }
  const archive = await readArchive(location.file, location.repo);
  let dirty = false;

  const transcriptIds = new Set(transcript.map((event) => event.id));
  const fromArchive: ToolEvent[] = [];
  for (const stored of Object.values(archive.events)) {
    if (transcriptIds.has(stored.event.id) || !inRange(stored.event, range)) continue;
    if (range.head === null && stored.local !== range.worktreePath) continue;
    fromArchive.push(structuredClone(stored.event));
  }
  const input = [...transcript, ...fromArchive];
  const inputs = new Set(input);
  const merged = withSnapshots(input);
  const addedBySnapshots = new Set(merged.filter((event) => !inputs.has(event)).map((event) => event.id));

  const byId = new Map<string, ToolEvent>();
  for (const event of merged) {
    const stored = archive.events[event.id];
    const filled = !hasChanges(event) && stored && hasChanges(stored.event) ? { ...event, changes: stored.event.changes } : event;
    const kept = byId.get(event.id);
    if (!kept || (!hasChanges(kept) && hasChanges(filled))) byId.set(event.id, filled);
  }
  const events = [...byId.values()].sort((a, b) => a.at - b.at);
  const restored = fromArchive.filter((event) => !addedBySnapshots.has(event.id)).length;

  for (const event of events) {
    const stored = archive.events[event.id];
    const local = range.head === null ? range.worktreePath : (stored?.local ?? null);
    if (!stored || stored.local !== local || (hasChanges(event) && !hasChanges(stored.event))) {
      archive.events[event.id] = { event, local };
      dirty = true;
    }
  }

  const liveCompletions = await completionsOf(events);
  const completions = new Map(liveCompletions);
  if (taskFile) {
    const storedTimes = archive.completions[taskFile] ?? {};
    for (const [id, at] of Object.entries(storedTimes)) {
      if (!completions.has(id)) completions.set(id, at);
    }
    for (const [id, at] of liveCompletions) {
      if (storedTimes[id] === at) continue;
      storedTimes[id] = at;
      dirty = true;
    }
    archive.completions[taskFile] = storedTimes;
  }

  if (dirty) {
    try {
      await mkdir(ARCHIVE_DIR, { recursive: true });
      const temp = `${location.file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, JSON.stringify(archive));
      await rename(temp, location.file);
    } catch (error) {
      console.warn("[intent-diff] archive write failed", location.file, error);
    }
  }
  return { events, completions, restored };
}
