"use client";

import { useState } from "react";
import type { ActionRequest } from "@/lib/orca/actions";
import type { AgentCard, WorktreeSummary } from "@/lib/orca/types";
import { buildSteps } from "@/lib/workflow/steps";
import type { WorkflowMode } from "@/lib/workflow/types";
import type { BoardGroups } from "./classify";
import { RestingList } from "./RestingList";
import { Stepper } from "./Stepper";

interface WorktreePanelProps {
  worktree: WorktreeSummary;
  mode: WorkflowMode;
  groups: BoardGroups;
  now: number;
  renderCard: (agent: AgentCard) => React.ReactNode;
  onAction: (action: ActionRequest) => void;
}

type PanelFilter = "needsMe" | "working";

const FILTER_OPTIONS: { key: PanelFilter; label: string; tone: string }[] = [
  { key: "needsMe", label: "내 차례", tone: "text-ask" },
  { key: "working", label: "작업 중", tone: "text-now" },
];

export function WorktreePanel({ worktree, mode, groups, now, renderCard, onAction }: WorktreePanelProps) {
  const pr = worktree.pullRequest;
  const [filter, setFilter] = useState<PanelFilter | null>(null);
  const activeFilter = filter && groups[filter].length > 0 ? filter : null;
  const listed = activeFilter ? groups[activeFilter] : [...groups.needsMe, ...groups.working, ...groups.resting];
  const open = (target: string) =>
    onAction({ type: "open-artifact", target, via: "system", worktreePath: worktree.path });

  return (
    <section className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-hair pt-6 pb-10 lg:grid-cols-12">
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
      </div>

      <div className="flex min-w-0 flex-col gap-6 lg:col-span-9">
        {worktree.flowTasks.length === 0 ? (
          <p className="text-[14px] text-muted">이 브랜치를 가리키는 flow 작업 문서가 없어요.</p>
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
                <Stepper steps={buildSteps(mode, task, pr)} size="full" />
              </div>
            );
          })
        )}

        {listed.length > 0 && <RestingList agents={listed} now={now} showRepo={false} renderCard={renderCard} />}
      </div>
    </section>
  );
}
