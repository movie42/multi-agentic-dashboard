"use client";

import { useState } from "react";
import type { WorktreeSummary } from "@/common/board/types";
import type { StepStatus, WorkflowStep } from "@/common/workflow/types";
import type { UserGroup } from "../model/canvasState";
import { CLUSTER_HEAD, GROUP_HEAD, type Rect } from "../model/layout";

const STEP_DOT: Record<StepStatus, string> = {
  done: "bg-done",
  now: "bg-now",
  ask: "bg-ask",
  wait: "bg-faint",
  skip: "bg-faint opacity-50",
};

interface ClusterFrameProps {
  id: string;
  rect: Rect;
  worktree: WorktreeSummary;
  steps: WorkflowStep[] | null;
  sessions: number;
  empty: boolean;
  onOpen: () => void;
}

/** A worktree as a dashed frame; dragging its header moves every session in it. */
export function ClusterFrame({ id, rect, worktree, steps, sessions, empty, onOpen }: ClusterFrameProps) {
  const current = steps?.findIndex((step) => step.status === "now" || step.status === "ask") ?? -1;
  const pr = worktree.pullRequest.kind === "found" ? worktree.pullRequest : null;
  return (
    <g>
      <rect data-cluster={id} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={14} strokeDasharray="6 5" strokeWidth={1.3} className="fill-tint/40 stroke-faint" />
      <foreignObject x={rect.x} y={rect.y} width={rect.w} height={CLUSTER_HEAD}>
        <div data-drag="cluster" data-id={id} className="flex h-full cursor-grab items-center gap-2 px-4 text-[12px] leading-none select-none active:cursor-grabbing">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-muted">{worktree.isMain ? "MAIN" : "WORKTREE"}</span>
          <span className="truncate font-bold">{worktree.name}</span>
          {steps && steps.length > 0 && (
            <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
              {steps.map((step) => (
                <span key={step.key} className={`size-1.5 rounded-full ${STEP_DOT[step.status]}`} />
              ))}
            </span>
          )}
          {steps && current >= 0 && (
            <span className="shrink-0 text-muted">
              {current + 1}/{steps.length} {steps[current]?.label}
            </span>
          )}
          {pr && <span className="shrink-0 font-semibold text-pr">PR #{pr.number}</span>}
          <span className="ml-auto shrink-0 text-muted">세션 {sessions}</span>
          <button type="button" onClick={onOpen} className="shrink-0 font-semibold underline decoration-faint underline-offset-[3px] hover:decoration-current">
            워크트리 열기
          </button>
        </div>
      </foreignObject>
      {empty && (
        <foreignObject x={rect.x} y={rect.y + CLUSTER_HEAD} width={rect.w} height={rect.h - CLUSTER_HEAD}>
          <p className="px-4 text-[12px] text-muted">열린 세션이 없어요</p>
        </foreignObject>
      )}
    </g>
  );
}

interface GroupFrameProps {
  rect: Rect;
  group: UserGroup;
  onRename: (name: string) => void;
  onUngroup: () => void;
}

/** A group a person made; it may cross worktrees. Double-click the name to rename. */
export function GroupFrame({ rect, group, onRename, onUngroup }: GroupFrameProps) {
  const [editing, setEditing] = useState(false);
  const finish = (value: string) => {
    setEditing(false);
    if (value.trim() && value.trim() !== group.name) onRename(value.trim());
  };
  return (
    <g className="group">
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={18} strokeWidth={1.5} className="fill-focus/5 stroke-focus/60" />
      <foreignObject x={rect.x} y={rect.y} width={rect.w} height={GROUP_HEAD}>
        <div data-drag="group" data-id={group.id} className="flex h-full cursor-grab items-center gap-2 px-4 text-[12px] leading-none select-none active:cursor-grabbing">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-focus">GROUP</span>
          {editing ? (
            <input
              autoFocus
              defaultValue={group.name}
              onBlur={(event: React.FocusEvent<HTMLInputElement>) => finish(event.target.value)}
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Enter") finish(event.currentTarget.value);
                if (event.key === "Escape") setEditing(false);
              }}
              className="min-w-0 flex-1 rounded-[4px] bg-bg px-1 py-0.5 font-bold outline-none"
            />
          ) : (
            <span onDoubleClick={() => setEditing(true)} title="두 번 눌러 이름 바꾸기" className="truncate font-bold text-focus">
              {group.name}
            </span>
          )}
          <button type="button" onClick={onUngroup} title="그룹 풀기 (⌘⇧G)" className="ml-auto shrink-0 text-muted opacity-0 group-hover:opacity-100 hover:text-fg">
            풀기
          </button>
        </div>
      </foreignObject>
    </g>
  );
}
