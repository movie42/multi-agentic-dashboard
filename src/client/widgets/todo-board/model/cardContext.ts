import type { WorktreeSummary } from "@/common/board/types";
import type { TodoCard } from "@/common/todos/types";
import { buildSteps, currentStep } from "@/common/workflow/steps";
import type { FlowTaskSummary, PullRequestInfo, WorkflowMode } from "@/common/workflow/types";

export type ModeOf = (repo: string) => WorkflowMode;

export interface CardFlowTask {
  task: FlowTaskSummary;
  /** The step the task is on, e.g. "구현 3/5"; null when every step is done. */
  step: string | null;
}

export interface CardContext {
  worktree: WorktreeSummary | null;
  pullRequest: Extract<PullRequestInfo, { kind: "found" }> | null;
  flowTasks: CardFlowTask[];
}

/**
 * What the dashboard already knows about a card's work: its worktree's PR, the flow tasks on that worktree, and any
 * flow task elsewhere whose id is one of the card's Jira keys.
 */
export function cardContext(card: TodoCard, worktrees: readonly WorktreeSummary[], modeOf: ModeOf): CardContext {
  const worktree = worktrees.find((each) => each.path === card.worktreePath) ?? null;
  const keys = new Set(card.jira.map((jira) => jira.key));
  const fromKeys = worktrees.flatMap((each) =>
    [...each.flowTasks, ...each.otherFlowTasks].filter((task) => keys.has(task.taskId.toUpperCase())).map((task) => ({ task, home: each })),
  );
  const own = (worktree?.flowTasks ?? []).map((task) => ({ task, home: worktree }));
  const seen = new Set<string>();
  const flowTasks = [...own, ...fromKeys].flatMap(({ task, home }) => {
    const id = `${task.domain}/${task.taskId}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const pr = home?.pullRequest ?? { kind: "not-applicable" as const };
    const step = currentStep(buildSteps(modeOf(home?.repo ?? card.repo ?? ""), task, pr));
    return [{ task, step: step ? `${step.label}${step.detail ? ` ${step.detail}` : ""}` : null }];
  });
  const pr = worktree?.pullRequest;
  return { worktree, pullRequest: pr?.kind === "found" ? pr : null, flowTasks };
}

export function pullRequestLabel(pr: Extract<PullRequestInfo, { kind: "found" }>): string {
  if (pr.state === "MERGED") return `#${pr.number} 머지됨`;
  if (pr.state === "CLOSED") return `#${pr.number} 닫힘`;
  return `#${pr.number} ${pr.isDraft ? "초안" : "리뷰 중"}`;
}
