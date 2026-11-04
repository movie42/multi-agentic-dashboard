import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SnapshotStep } from "@/server/intentDiff/SnapshotLog";

export type ReadAtTree = (worktreePath: string, tree: string, file: string) => Promise<string | null>;
import { z } from "zod";
import type { ToolEvent } from "@/common/intentDiff/types";
import { parseJson } from "@/server/shared/fallback";

const text = z.string().optional().catch(undefined);

const rawItemSchema = z.looseObject({
  id: text,
  title: text,
  done: z.boolean().optional().catch(undefined),
  rows: z.array(z.unknown()).optional().catch(undefined),
});

const rawBlockSchema = z.looseObject({
  type: text,
  id: text,
  title: text,
  items: z.array(rawItemSchema).optional().catch(undefined),
});

const rawTaskSchema = z.looseObject({
  id: text,
  title: text,
  branch: text,
  stages: z
    .looseObject({ tasks: z.looseObject({ status: text, blocks: z.array(rawBlockSchema).optional().catch(undefined) }).optional().catch(undefined) })
    .optional()
    .catch(undefined),
});

type RawItem = z.infer<typeof rawItemSchema>;
type RawTask = z.infer<typeof rawTaskSchema>;

function parseRawTask(raw: string | null): RawTask | null {
  if (!raw) return null;
  const parsed = rawTaskSchema.safeParse(parseJson(raw));
  return parsed.success ? parsed.data : null;
}

export interface PlanItem {
  id: string;
  title: string;
  done: boolean;
  files: string[];
}

export interface PlanPhase {
  id: string;
  title: string;
  items: PlanItem[];
}

export interface LoadedPlan {
  taskKey: string;
  title: string;
  /** Repo-relative path of the task JSON. */
  taskFile: string;
  phases: PlanPhase[];
}

const ITEM_ID = /\bP\d+-[A-Za-z0-9]+\b/g;
const MARKS_DONE = /done["'\]]*\s*[:=]\s*(true|True)\b/;

export function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function filesOf(rows: unknown[] | undefined): string[] {
  const files: string[] = [];
  for (const row of rows ?? []) {
    if (!Array.isArray(row) || row[0] !== "파일" || typeof row[1] !== "string") continue;
    for (const match of row[1].matchAll(/<code>([^<]+)<\/code>/g)) {
      const value = plainText(match[1] ?? "").replace(/^\.\//, "");
      if (/[/.]/.test(value) && !/\s/.test(value)) files.push(value);
    }
  }
  return files;
}

function parsePlan(json: RawTask, taskKey: string, taskFile: string): LoadedPlan {
  const phases: PlanPhase[] = [];
  for (const block of json.stages?.tasks?.blocks ?? []) {
    if (block.type !== "checklist" || !block.id) continue;
    const items = (block.items ?? [])
      .filter((item): item is RawItem & { id: string } => typeof item.id === "string" && !item.id.endsWith("-V"))
      .map((item) => ({
        id: item.id,
        title: plainText(item.title ?? item.id),
        done: item.done === true,
        files: filesOf(item.rows),
      }));
    phases.push({ id: block.id, title: plainText(block.title ?? block.id), items });
  }
  return { taskKey, title: json.title ?? taskKey, taskFile, phases };
}

interface Candidate {
  taskKey: string;
  taskFile: string;
  json: RawTask;
  mtimeMs: number;
}

async function candidates(worktreePath: string): Promise<Candidate[]> {
  const docs = path.join(worktreePath, "docs");
  const domains = await readdir(docs, { withFileTypes: true }).catch(() => []);
  const found: Candidate[] = [];
  for (const domain of domains) {
    if (!domain.isDirectory()) continue;
    const tasksDir = path.join(docs, domain.name, "tasks");
    for (const name of await readdir(tasksDir).catch(() => [])) {
      if (!name.endsWith(".json")) continue;
      const full = path.join(tasksDir, name);
      const info = await stat(full).catch(() => null);
      const json = await readFile(full, "utf8")
        .then(parseRawTask)
        .catch(() => null);
      if (!info || !json) continue;
      const id = json.id ?? name.replace(/\.json$/, "");
      found.push({
        taskKey: `${domain.name}/${id}`,
        taskFile: path.relative(worktreePath, full).split(path.sep).join("/"),
        json,
        mtimeMs: info.mtimeMs,
      });
    }
  }
  return found;
}

/**
 * The /flow task that plans this diff: the one named by `taskKey`, otherwise the task recorded on
 * this branch — an unfinished one first, then the most recently written.
 */
export async function loadPlan(worktreePath: string, branch: string | null, taskKey: string | null): Promise<LoadedPlan | null> {
  const all = await candidates(worktreePath);
  const named = taskKey ? all.find((candidate) => candidate.taskKey === taskKey) : null;
  if (taskKey && !named) throw new Error(`작업 문서를 찾을 수 없어요: ${taskKey}`);
  const picked =
    named ??
    all
      .filter((candidate) => branch !== null && candidate.json.branch === branch)
      .sort((a, b) => {
        const unfinished = Number(b.json.stages?.tasks?.status !== "done") - Number(a.json.stages?.tasks?.status !== "done");
        return unfinished || b.mtimeMs - a.mtimeMs;
      })[0];
  if (!picked) return null;
  const plan = parsePlan(picked.json, picked.taskKey, picked.taskFile);
  return plan.phases.some((phase) => phase.items.length > 0) ? plan : null;
}

function doneIds(raw: string | null): Set<string> {
  const json = parseRawTask(raw);
  const ids = (json?.stages?.tasks?.blocks ?? [])
    .flatMap((block) => block.items ?? [])
    .flatMap((item) => (item.done === true && typeof item.id === "string" ? [item.id] : []));
  return new Set(ids);
}

/**
 * When each plan item was checked off. Snapshots read the task JSON before and after each call;
 * without them, a call that edits the task file and sets `done` to true counts for the item ids
 * it mentions.
 */
export async function completionTimes(
  plan: LoadedPlan,
  steps: SnapshotStep[],
  events: ToolEvent[],
  readAtTree: ReadAtTree,
): Promise<Map<string, number>> {
  const ids = new Set(plan.phases.flatMap((phase) => phase.items.map((item) => item.id)));
  const completed = new Map<string, number>();
  const touching = steps.filter((step) => plan.taskFile in step.changes);
  for (const step of touching) {
    const before = doneIds(await readAtTree(step.worktreePath, step.previousTree, plan.taskFile));
    const after = doneIds(await readAtTree(step.worktreePath, step.record.tree, plan.taskFile));
    for (const id of after) {
      if (ids.has(id) && !before.has(id) && !completed.has(id)) completed.set(id, step.record.at);
    }
  }
  const taskName = path.basename(plan.taskFile);
  for (const event of events) {
    const onTask = plan.taskFile in event.changes || (event.command ?? "").includes(taskName);
    if (!onTask || !MARKS_DONE.test(event.inputText)) continue;
    for (const match of event.inputText.matchAll(ITEM_ID)) {
      if (ids.has(match[0]) && !completed.has(match[0])) completed.set(match[0], event.at);
    }
  }
  return completed;
}

export function matchesHint(file: string, hint: string): boolean {
  if (file === hint) return true;
  if (!hint.includes("*")) return hint.endsWith("/") && file.startsWith(hint);
  const pattern = hint
    .split("**")
    .map((part) => part.split("*").map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${pattern}$`).test(file);
}
