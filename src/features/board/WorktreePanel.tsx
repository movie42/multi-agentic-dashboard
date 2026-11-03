"use client";

import { useState } from "react";
import type { ActionRequest } from "@/lib/orca/actions";
import type { AgentCard, WorktreeSummary } from "@/lib/orca/types";
import { buildSteps } from "@/lib/workflow/steps";
import type { FeatureRowSummary, PullRequestInfo, WorkflowMode } from "@/lib/workflow/types";
import type { BoardGroups } from "./classify";
import { AgentList } from "./AgentList";
import { Stepper } from "./Stepper";

interface WorktreePanelProps {
  worktree: WorktreeSummary;
  featureRow: FeatureRowSummary | null;
  mode: WorkflowMode;
  groups: BoardGroups;
  now: number;
  renderCard: (agent: AgentCard) => React.ReactNode;
  workersOf: (agent: AgentCard) => AgentCard[];
  childPanels: React.ReactNode[];
  expandedId: string | null;
  onAction: (action: ActionRequest) => void;
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
  now,
  renderCard,
  workersOf,
  childPanels,
  expandedId,
  onAction,
}: WorktreePanelProps) {
  const pr = worktree.pullRequest;
  const [filter, setFilter] = useState<PanelFilter | null>(null);
  const activeFilter = filter && groups[filter].length > 0 ? filter : null;
  const all = [...groups.needsMe, ...groups.working, ...groups.resting];
  const listed = activeFilter ? groups[activeFilter] : all;
  const terminalHandle = all.find((agent) => agent.terminalHandle)?.terminalHandle ?? null;
  const toTerminal = () =>
    onAction(
      terminalHandle
        ? { type: "focus-terminal", terminalHandle }
        : { type: "open-terminal", worktreePath: worktree.path },
    );
  const open = (target: string) =>
    onAction({ type: "open-artifact", target, via: "system", worktreePath: worktree.path });

  return (
    <section
      data-jump={worktree.worktreeId}
      className="grid scroll-mt-6 grid-cols-1 gap-x-6 gap-y-4 border-t border-hair pt-6 pb-10 lg:grid-cols-12"
    >
      <div className="lg:col-span-3">
        <h3 className="text-[17px] leading-[1.35] font-bold tracking-[-0.01em]">{worktree.name}</h3>
        {worktree.branch && worktree.branch !== worktree.name && (
          <p className="mt-1 font-mono text-[12px] text-muted">{worktree.branch}</p>
        )}
        <p className="mt-2 flex flex-wrap gap-x-1 text-[12px]">
          {FILTER_OPTIONS.filter((option) => groups[option.key].length > 0).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={activeFilter === option.key}
              onClick={() => setFilter(activeFilter === option.key ? null : option.key)}
              className={`-mx-0.5 rounded-full px-2 py-0.5 ${option.tone} ${
                activeFilter === option.key ? "bg-tint font-semibold" : "hover:bg-tint"
              }`}
            >
              {option.label} {groups[option.key].length}
            </button>
          ))}
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
        {featureRow && (featureRow.issue || featureRow.jiraStatus || featureRow.jiraTodo) && (
          <p className="mt-2 text-[12px]">
            {featureRow.issue && <span className="font-mono text-muted">{featureRow.issue} </span>}
            <span>{featureRow.jiraStatus ?? "Jira 상태 기록 없음"}</span>
            {featureRow.jiraTodo && <span className="block text-ask">사람이 옮길 것 · {featureRow.jiraTodo}</span>}
          </p>
        )}
        <p className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
          <button
            type="button"
            onClick={() => onAction({ type: "launch-agent", worktreePath: worktree.path, prompt: "" })}
            className="rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint"
          >
            새 세션
          </button>
          <button
            type="button"
            onClick={toTerminal}
            title={terminalHandle ? "에이전트 터미널로 이동해요" : "이 워크트리에 새 터미널을 열어요"}
            className="rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint"
          >
            터미널로
          </button>
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-6 lg:col-span-9">
        {worktree.flowTasks.length === 0 ? (
          <p className="text-[14px] text-muted">진행 중인 flow 작업 문서가 없어요.</p>
        ) : (
          worktree.flowTasks.map((task) => {
            const pageIndex = task.pageIndex;
            return (
              <div key={`${task.domain}/${task.taskId}`} className="flex flex-col gap-3">
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
                    문서에 기록된 브랜치는 <span className="font-mono">{task.branch ?? "없음"}</span>이에요
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
                const taskPr: PullRequestInfo = task.branch === worktree.branch ? pr : { kind: "not-applicable" };
                return (
                  <li key={`${task.domain}/${task.taskId}`} className="flex flex-col gap-1.5">
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
                        <span className="ml-auto shrink-0 text-muted">빌드 필요</span>
                      )}
                    </p>
                    <Stepper steps={buildSteps(mode, task, taskPr)} size="compact" />
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {listed.length > 0 && (
          <AgentList
            agents={listed}
            now={now}
            showRepo={false}
            renderCard={renderCard}
            expandedId={expandedId}
            workersOf={workersOf}
          />
        )}

        {childPanels.length > 0 && (
          <details className="text-[13px]">
            <summary className="cursor-pointer text-muted hover:text-current" title="Orca에서 이 워크트리 아래로 만든 워크트리">
              하위 워크트리 {childPanels.length}
            </summary>
            <div className="mt-3">{childPanels}</div>
          </details>
        )}
      </div>
    </section>
  );
}
