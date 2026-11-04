import "server-only";
import path from "node:path";
import type { FlowStageStatus, FlowTaskSummary } from "@/common/workflow/types";
import { checklistItemSchema, type ChecklistItem, type FlowStageJson, type FlowTaskJson } from "./schema";

export interface WorktreeFlowTasks {
  current: FlowTaskSummary[];
  other: FlowTaskSummary[];
}

export interface WorktreeFlowScan {
  branch: string | null;
  tasks: FlowTaskSummary[];
}

export interface FlowTaskLocation {
  domain: string;
  domainDir: string;
  prdExists: boolean;
  pageIndex: string | null;
  mtimeMs: number;
}

const STAGE_STATUSES: readonly FlowStageStatus[] = ["done", "now", "ask", "wait"];

function toStatus(value: string | null | undefined): FlowStageStatus {
  return STAGE_STATUSES.find((status) => status === value) ?? "wait";
}

function checklistItems(stage: FlowStageJson | null | undefined): ChecklistItem[] {
  return (stage?.blocks ?? [])
    .filter((block) => block.type === "checklist")
    .flatMap((block) => block.items ?? [])
    .flatMap((item) => {
      const parsed = checklistItemSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
}

export function summarizeFlowTask(json: FlowTaskJson, location: FlowTaskLocation): FlowTaskSummary {
  const { domain, domainDir, prdExists, pageIndex, mtimeMs } = location;
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

export function isFinishedFlowTask(task: FlowTaskSummary): boolean {
  const statuses = [task.plan, task.screen, task.tasks?.status, task.verify?.status].filter(
    (status): status is FlowStageStatus => Boolean(status),
  );
  return statuses.length > 0 && statuses.every((status) => status === "done") && (task.grill?.open ?? 0) === 0;
}

export function flowTaskKey(task: FlowTaskSummary): string {
  return `${task.domain}/${task.taskId}`;
}

/**
 * One copy per task across a repo's worktrees. A task file only exists in the checkout that
 * wrote it until it is merged, so each worktree alone misses its siblings' documents. When
 * several checkouts hold the same task, the copy in the worktree on the task's own branch wins,
 * then the most recently written one.
 */
export function mergeRepoFlowTasks(scans: WorktreeFlowScan[]): FlowTaskSummary[] {
  const picked = scans
    .flatMap((scan) => scan.tasks.map((task) => ({ task, owner: task.branch !== null && task.branch === scan.branch })))
    .reduce((acc, entry) => {
      const key = flowTaskKey(entry.task);
      const held = acc.get(key);
      const wins =
        !held ||
        (entry.owner && !held.owner) ||
        (entry.owner === held.owner && entry.task.updatedAt > held.task.updatedAt);
      return wins ? acc.set(key, entry) : acc;
    }, new Map<string, { task: FlowTaskSummary; owner: boolean }>());
  return [...picked.values()].map((entry) => entry.task).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * current — tasks whose recorded branch is this worktree's branch; with none, the unfinished
 * tasks in this worktree's own checkout. other — every remaining task in the repo.
 */
export function splitFlowTasks(repoTasks: FlowTaskSummary[], own: WorktreeFlowScan): WorktreeFlowTasks {
  const ownKeys = new Set(own.tasks.map(flowTaskKey));
  const branch = own.branch;
  const matched = branch ? repoTasks.filter((task) => task.branch === branch) : [];
  const activeMatched = matched.filter((task) => !isFinishedFlowTask(task));
  const current =
    activeMatched.length > 0
      ? activeMatched
      : matched.length > 0
        ? matched.slice(0, 1)
        : repoTasks.filter((task) => ownKeys.has(flowTaskKey(task)) && !isFinishedFlowTask(task));
  return { current, other: repoTasks.filter((task) => !current.includes(task)) };
}
