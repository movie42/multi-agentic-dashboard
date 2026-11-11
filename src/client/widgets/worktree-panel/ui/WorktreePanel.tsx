"use client";

import { useState } from "react";
import { intentDiffHref } from "@/client/entities/intent-diff";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, WorktreeSummary } from "@/common/orca/types";
import { buildSteps } from "@/common/workflow/steps";
import type {
  FeatureRowSummary,
  PullRequestInfo,
  WorkflowMode,
} from "@/common/workflow/types";
import type { BoardGroups } from "@/client/entities/agent";
import { Stepper } from "@/client/entities/workflow";
import { useWorktreeWizard, WorktreeWizardPanel, wizardOrigin } from "@/client/features/create-worktree";
import { RemoveWorktree } from "@/client/features/remove-worktree";
import { PendingButton } from "@/client/shared/ui/PendingButton";
import { Spinner } from "@/client/shared/ui/Spinner";
import { useSessionOrder } from "../model/useSessionOrder";

interface WorktreePanelProps {
  worktree: WorktreeSummary;
  featureRow: FeatureRowSummary | null;
  mode: WorkflowMode;
  groups: BoardGroups;
  renderAgents: (
    agents: AgentCard[],
    onReorder: (draggedId: string, targetId: string, placeAfter: boolean) => void,
  ) => React.ReactNode;
  ancestors: WorktreeLink[];
  childLinks: WorktreeLink[];
  onAction: (action: ActionRequest) => Promise<void>;
  onDropWorktree?: (draggedId: string, placeAfter: boolean) => void;
}

export interface WorktreeLink {
  worktreeId: string;
  name: string;
  needsMe: number;
  working: number;
}

const WORKTREE_DRAG_TYPE = "application/x-agent-control-worktree";

type DropEdge = "before" | "after";

const DROP_EDGE_CLASS: Record<DropEdge, string> = {
  before: "shadow-[inset_0_2px_0_0_var(--focus)]",
  after: "shadow-[inset_0_-2px_0_0_var(--focus)]",
};

const INDENT = ["", "pl-3.5", "pl-7"] as const;
const indentOf = (depth: number) => INDENT[Math.min(depth, INDENT.length - 1)];

const scrollToWorktree = (worktreeId: string) =>
  document
    .querySelector<HTMLElement>(`[data-jump="${CSS.escape(worktreeId)}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

function Elbow() {
  return (
    <span
      aria-hidden
      className="mr-1.5 inline-block h-2.5 w-2 -translate-y-1 border-b border-l border-muted"
    />
  );
}

function GripIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 16"
      className="mt-[0.2em] h-[1em] w-[0.6em] shrink-0 fill-current text-faint group-hover:text-muted"
    >
      {[3, 8, 13].flatMap((cy) =>
        [3, 7].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.4} />),
      )}
    </svg>
  );
}

type PanelFilter = "needsMe" | "working";

const FILTER_OPTIONS: { key: PanelFilter; label: string; tone: string }[] = [
  { key: "needsMe", label: "내 차례", tone: "text-ask" },
  { key: "working", label: "작업 중", tone: "text-now" },
];

export function WorktreePanel({
  worktree,
  featureRow,
  mode,
  groups,
  renderAgents,
  ancestors,
  childLinks,
  onAction,
  onDropWorktree,
}: WorktreePanelProps) {
  const pr = worktree.pullRequest;
  const [filter, setFilter] = useState<PanelFilter | null>(null);
  const [dropEdge, setDropEdge] = useState<DropEdge | null>(null);
  const edgeOf = (event: React.DragEvent<HTMLElement>): DropEdge => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };
  const wizard = useWorktreeWizard(wizardOrigin(worktree, true));
  const activeFilter = filter && groups[filter].length > 0 ? filter : null;
  const sessions = useSessionOrder(worktree.worktreeId, [
    ...groups.needsMe,
    ...groups.working,
    ...groups.resting,
  ]);
  const all = sessions.ordered;
  const listed = activeFilter
    ? all.filter((agent) => groups[activeFilter].includes(agent))
    : all;
  const terminalHandle =
    all.find((agent) => agent.terminalHandle)?.terminalHandle ?? null;
  const toTerminal = () =>
    onAction(
      terminalHandle
        ? { type: "focus-terminal", terminalHandle }
        : { type: "open-terminal", worktreePath: worktree.path },
    );
  const open = (target: string) =>
    onAction({
      type: "open-artifact",
      target,
      via: "system",
      worktreePath: worktree.path,
    });

  return (
    <section
      data-jump={worktree.worktreeId}
      onDragOver={(event: React.DragEvent<HTMLElement>) => {
        if (
          !onDropWorktree ||
          !event.dataTransfer.types.includes(WORKTREE_DRAG_TYPE)
        )
          return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropEdge(edgeOf(event));
      }}
      onDragLeave={(event: React.DragEvent<HTMLElement>) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        setDropEdge(null);
      }}
      onDrop={(event: React.DragEvent<HTMLElement>) => {
        setDropEdge(null);
        const draggedId = event.dataTransfer.getData(WORKTREE_DRAG_TYPE);
        if (!onDropWorktree || !draggedId) return;
        event.preventDefault();
        if (draggedId !== worktree.worktreeId)
          onDropWorktree(draggedId, edgeOf(event) === "after");
      }}
      className={`grid scroll-mt-6 grid-cols-1 gap-x-6 gap-y-4 border-t border-hair pt-6 pb-10 lg:grid-cols-[176px_minmax(0,1fr)] ${
        dropEdge ? DROP_EDGE_CLASS[dropEdge] : ""
      }`}
    >
      <div className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
        {ancestors.map((ancestor, depth) => (
          <button
            key={ancestor.worktreeId}
            type="button"
            onClick={() => scrollToWorktree(ancestor.worktreeId)}
            title={`${ancestor.name} 워크트리로 이동해요`}
            className={`block max-w-full truncate text-left text-[13px] leading-[1.6] text-muted hover:text-current ${indentOf(depth)}`}
          >
            {depth > 0 && <Elbow />}
            {ancestor.name}
          </button>
        ))}
        <h3
          draggable={onDropWorktree !== undefined}
          onDragStart={(event: React.DragEvent<HTMLHeadingElement>) => {
            event.dataTransfer.setData(WORKTREE_DRAG_TYPE, worktree.worktreeId);
            event.dataTransfer.effectAllowed = "move";
          }}
          title={onDropWorktree ? "끌어서 워크트리 순서를 바꿔요" : undefined}
          className={`group text-[17px] leading-[1.35] font-bold tracking-[-0.01em] break-all ${indentOf(ancestors.length)} ${
            onDropWorktree
              ? "-mx-1.5 flex cursor-grab items-start gap-1 rounded-md px-1.5 py-0.5 hover:bg-tint active:cursor-grabbing"
              : ""
          }`}
        >
          {onDropWorktree && <GripIcon />}
          <span className="min-w-0">
            {ancestors.length > 0 && <Elbow />}
            {worktree.name}
          </span>
        </h3>
        {worktree.branch && worktree.branch !== worktree.name && (
          <p className="mt-1 font-mono text-[12px] break-all text-muted">
            {worktree.branch}
          </p>
        )}
        <p className="mt-2 flex flex-wrap gap-x-1 text-[12px]">
          {FILTER_OPTIONS.filter((option) => groups[option.key].length > 0).map(
            (option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={activeFilter === option.key}
                onClick={() =>
                  setFilter(activeFilter === option.key ? null : option.key)
                }
                className={`-mx-0.5 rounded-full px-2 py-0.5 ${option.tone} ${
                  activeFilter === option.key
                    ? "bg-tint font-semibold"
                    : "hover:bg-tint"
                }`}
              >
                {option.label} {groups[option.key].length}
              </button>
            ),
          )}
        </p>
        {pr.kind === "found" && (
          <button
            type="button"
            onClick={() => open(pr.url)}
            className="mt-2 text-[13px] underline decoration-faint underline-offset-[3px] hover:decoration-current"
          >
            PR #{pr.number} 열기
          </button>
        )}
        {featureRow &&
          (featureRow.issue ||
            featureRow.jiraStatus ||
            featureRow.jiraTodo) && (
            <p className="mt-2 text-[12px]">
              {featureRow.issue && (
                <span className="font-mono text-muted">
                  {featureRow.issue}{" "}
                </span>
              )}
              <span>{featureRow.jiraStatus ?? "Jira 상태 기록 없음"}</span>
              {featureRow.jiraTodo && (
                <span className="block text-ask">
                  사람이 옮길 것 · {featureRow.jiraTodo}
                </span>
              )}
            </p>
          )}
        <p className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
          <PendingButton
            onRun={() =>
              onAction({
                type: "launch-agent",
                worktreePath: worktree.path,
                prompt: "",
              })
            }
            pendingLabel="여는 중"
            className="rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint disabled:text-muted"
          >
            새 세션
          </PendingButton>
          <PendingButton
            onRun={toTerminal}
            pendingLabel="여는 중"
            title={
              terminalHandle
                ? "에이전트 터미널로 이동해요"
                : "이 워크트리에 새 터미널을 열어요"
            }
            className="rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint disabled:text-muted"
          >
            터미널로
          </PendingButton>
          <a
            href={intentDiffHref({ worktreePath: worktree.path })}
            target="_blank"
            rel="noreferrer"
            title="분기점 이후 변경을 계획 항목 → 의도 순서로 새 창에서 읽어요"
            className="rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint"
          >
            변경 읽기
          </a>
          <button
            type="button"
            onClick={wizard.open}
            disabled={wizard.busy}
            aria-busy={wizard.busy}
            title="에이전트가 어떤 작업인지 묻고, 이 브랜치에서 새 워크트리를 만들어요"
            className="inline-flex items-center gap-1.5 rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint disabled:cursor-progress disabled:text-muted"
          >
            {wizard.busy && <Spinner />}
            여기서 워크트리
          </button>
        </p>
        <RemoveWorktree worktree={worktree} sessionCount={all.length} />
        {childLinks.length > 0 && (
          <div className="mt-4 text-[13px]">
            <p
              className="text-[12px] text-muted"
              title="Orca에서 이 워크트리 아래로 만든 워크트리"
            >
              하위 워크트리 {childLinks.length}
            </p>
            <ul className="mt-1">
              {childLinks.map((child) => (
                <li key={child.worktreeId}>
                  <button
                    type="button"
                    onClick={() => scrollToWorktree(child.worktreeId)}
                    title={`${child.name} 워크트리로 이동해요`}
                    className="flex max-w-full items-baseline py-0.5 text-left hover:underline"
                  >
                    <Elbow />
                    <span className="mr-1.5 truncate">{child.name}</span>
                    {child.needsMe > 0 && (
                      <span className="shrink-0 text-[12px] text-ask">
                        {child.needsMe}
                      </span>
                    )}
                    {child.needsMe === 0 && child.working > 0 && (
                      <span className="shrink-0 text-[12px] text-now">
                        {child.working}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <WorktreeWizardPanel wizard={wizard} />
        {worktree.flowTasks.length === 0 ? (
          <p className="text-[14px] text-muted">
            진행 중인 flow 작업 문서가 없어요.
          </p>
        ) : (
          worktree.flowTasks.map((task) => {
            const pageIndex = task.pageIndex;
            return (
              <div
                key={`${task.domain}/${task.taskId}`}
                className="flex flex-col gap-3"
              >
                <p className="flex items-baseline gap-2 text-[15px]">
                  <span className="font-semibold">{task.title}</span>
                  <span className="font-mono text-[12px] text-muted">
                    {task.domain}/{task.taskId}
                  </span>
                  {pageIndex && (
                    <button
                      type="button"
                      onClick={() => open(pageIndex)}
                      className="ml-auto shrink-0 text-[13px] underline decoration-faint underline-offset-[3px] hover:decoration-current"
                    >
                      문서 열기
                    </button>
                  )}
                </p>
                {task.branch !== worktree.branch && (
                  <p className="-mt-2 text-[12px] text-muted">
                    문서에 기록된 브랜치는{" "}
                    <span className="font-mono">{task.branch ?? "없음"}</span>
                    이에요
                  </p>
                )}
                <Stepper steps={buildSteps(mode, task, pr)} size="full" />
              </div>
            );
          })
        )}

        {worktree.otherFlowTasks.length > 0 && (
          <details className="text-[13px]">
            <summary className="cursor-pointer text-muted hover:text-current">
              다른 flow 문서 {worktree.otherFlowTasks.length}
            </summary>
            <ul className="mt-3 flex flex-col gap-4">
              {worktree.otherFlowTasks.map((task) => {
                const pageIndex = task.pageIndex;
                const taskPr: PullRequestInfo =
                  task.branch === worktree.branch
                    ? pr
                    : { kind: "not-applicable" };
                return (
                  <li
                    key={`${task.domain}/${task.taskId}`}
                    className="flex flex-col gap-1.5"
                  >
                    <p className="flex items-baseline gap-2">
                      <span>{task.title}</span>
                      <span className="font-mono text-[12px] text-muted">
                        {task.domain}/{task.taskId}
                        {task.branch && ` · ${task.branch}`}
                      </span>
                      {pageIndex ? (
                        <button
                          type="button"
                          onClick={() => open(pageIndex)}
                          className="ml-auto shrink-0 underline decoration-faint underline-offset-[3px] hover:decoration-current"
                        >
                          열기
                        </button>
                      ) : (
                        <span className="ml-auto shrink-0 text-muted">
                          빌드 필요
                        </span>
                      )}
                    </p>
                    <Stepper
                      steps={buildSteps(mode, task, taskPr)}
                      size="compact"
                    />
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {listed.length > 0 && renderAgents(listed, sessions.move)}
      </div>
    </section>
  );
}
