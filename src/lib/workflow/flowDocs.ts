import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FlowStageStatus, FlowTaskSummary } from "./types";

interface ChecklistItem {
  id?: string;
  done?: boolean;
}

interface StageJson {
  status?: string;
  blocks?: { type?: string; items?: ChecklistItem[] }[];
  rounds?: { questions?: { decision?: string }[] }[];
}

interface TaskJson {
  id?: string;
  title?: string;
  branch?: string;
  links?: { label?: string }[];
  feature?: { id?: string; doc?: string };
  stages?: Record<string, StageJson | undefined>;
}

const STAGE_STATUSES: readonly FlowStageStatus[] = ["done", "now", "ask", "wait"];

function toStatus(value: string | undefined): FlowStageStatus {
  return STAGE_STATUSES.find((status) => status === value) ?? "wait";
}

function checklistItems(stage: StageJson | undefined): ChecklistItem[] {
  return (stage?.blocks ?? [])
    .filter((block) => block.type === "checklist")
    .flatMap((block) => block.items ?? []);
}

const cache = new Map<string, { mtimeMs: number; json: TaskJson | null }>();

async function readTask(file: string): Promise<{ json: TaskJson | null; mtimeMs: number }> {
  const info = await stat(file);
  const cached = cache.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs) return cached;
  let json: TaskJson | null = null;
  try {
    json = JSON.parse(await readFile(file, "utf8")) as TaskJson;
  } catch (error) {
    console.warn("[flow] unreadable task", file, error);
  }
  const entry = { mtimeMs: info.mtimeMs, json };
  cache.set(file, entry);
  return entry;
}

async function exists(target: string): Promise<boolean> {
  return stat(target).then(
    () => true,
    () => false,
  );
}

function summarize(
  json: TaskJson,
  domain: string,
  domainDir: string,
  prdExists: boolean,
  pageIndex: string | null,
  mtimeMs: number,
): FlowTaskSummary {
  const stages = json.stages ?? {};
  const grillStage = stages.grill;
  const questions = (grillStage?.rounds ?? []).flatMap((round) => round.questions ?? []);
  const tasksStage = stages.tasks;
  const taskItems = checklistItems(tasksStage);
  const testItems = taskItems.filter((item) => item.id?.endsWith("-V"));
  const implItems = taskItems.filter((item) => !item.id?.endsWith("-V"));
  const verifyItems = checklistItems(stages.verify);
  const linksPrd = (json.links ?? []).some((link) => /PRD|기획/i.test(link.label ?? ""));

  return {
    taskId: json.id ?? path.basename(domainDir),
    title: json.title ?? json.id ?? "",
    domain,
    branch: json.branch ?? null,
    pageIndex,
    prdExists: prdExists || linksPrd || Boolean(stages.plan),
    grill: grillStage
      ? { open: questions.filter((question) => !question.decision).length, total: questions.length }
      : null,
    plan: stages.plan ? toStatus(stages.plan.status) : null,
    screen: stages.screen ? toStatus(stages.screen.status) : null,
    tasks: tasksStage
      ? {
          status: toStatus(tasksStage.status),
          implDone: implItems.filter((item) => item.done).length,
          implTotal: implItems.length,
          testDone: testItems.filter((item) => item.done).length,
          testTotal: testItems.length,
        }
      : null,
    verify: stages.verify
      ? {
          status: toStatus(stages.verify.status),
          done: verifyItems.filter((item) => item.done).length,
          total: verifyItems.length,
        }
      : null,
    featureDoc: typeof json.feature?.doc === "string" && path.isAbsolute(json.feature.doc) ? json.feature.doc : null,
    updatedAt: mtimeMs,
  };
}

function isFinished(task: FlowTaskSummary): boolean {
  const statuses = [task.plan, task.screen, task.tasks?.status, task.verify?.status].filter(
    (status): status is FlowStageStatus => Boolean(status),
  );
  return statuses.length > 0 && statuses.every((status) => status === "done") && (task.grill?.open ?? 0) === 0;
}

export interface WorktreeFlowTasks {
  current: FlowTaskSummary[];
  other: FlowTaskSummary[];
}

export interface WorktreeFlowScan {
  branch: string | null;
  tasks: FlowTaskSummary[];
}

export function flowTaskKey(task: FlowTaskSummary): string {
  return `${task.domain}/${task.taskId}`;
}

export async function scanFlowTasks(worktreePath: string, branch: string | null): Promise<WorktreeFlowScan> {
  const docs = path.join(worktreePath, "docs");
  const domains = await readdir(docs, { withFileTypes: true }).catch(() => []);
  const found: FlowTaskSummary[] = [];

  for (const entry of domains) {
    if (!entry.isDirectory()) continue;
    const domainDir = path.join(docs, entry.name);
    if (!(await exists(path.join(domainDir, "domain.json")))) continue;
    const taskFiles = await readdir(path.join(domainDir, "tasks")).catch(() => []);
    const prdExists =
      (await exists(path.join(domainDir, "prd.md"))) || (await exists(path.join(domainDir, "prd")));

    for (const file of taskFiles) {
      if (!file.endsWith(".json")) continue;
      const { json, mtimeMs } = await readTask(path.join(domainDir, "tasks", file));
      if (!json) continue;
      const taskId = json.id ?? file.replace(/\.json$/, "");
      const index = path.join(domainDir, taskId, "index.html");
      found.push(
        summarize(json, entry.name, domainDir, prdExists, (await exists(index)) ? index : null, mtimeMs),
      );
    }
  }

  return { branch, tasks: found };
}

/**
 * One copy per task across a repo's worktrees. A task file only exists in the checkout that
 * wrote it until it is merged, so each worktree alone misses its siblings' documents. When
 * several checkouts hold the same task, the copy in the worktree on the task's own branch wins,
 * then the most recently written one.
 */
export function mergeRepoFlowTasks(scans: WorktreeFlowScan[]): FlowTaskSummary[] {
  const picked = new Map<string, { task: FlowTaskSummary; owner: boolean }>();
  for (const scan of scans) {
    for (const task of scan.tasks) {
      const key = flowTaskKey(task);
      const owner = task.branch !== null && task.branch === scan.branch;
      const held = picked.get(key);
      if (!held || (owner && !held.owner) || (owner === held.owner && task.updatedAt > held.task.updatedAt)) {
        picked.set(key, { task, owner });
      }
    }
  }
  return [...picked.values()].map((entry) => entry.task).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * current — tasks whose recorded branch is this worktree's branch; with none, the unfinished
 * tasks in this worktree's own checkout. other — every remaining task in the repo.
 */
export function splitFlowTasks(
  repoTasks: FlowTaskSummary[],
  own: WorktreeFlowScan,
): WorktreeFlowTasks {
  const ownKeys = new Set(own.tasks.map(flowTaskKey));
  const branch = own.branch;
  const matched = branch ? repoTasks.filter((task) => task.branch === branch) : [];
  const activeMatched = matched.filter((task) => !isFinished(task));
  const current =
    activeMatched.length > 0
      ? activeMatched
      : matched.length > 0
        ? matched.slice(0, 1)
        : repoTasks.filter((task) => ownKeys.has(flowTaskKey(task)) && !isFinished(task));
  return { current, other: repoTasks.filter((task) => !current.includes(task)) };
}
