"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import { flowDocsOf } from "@/common/workflow/steps";
import type { StepStatus, WorkflowStep } from "@/common/workflow/types";
import { displayStateOf, useRestOverrides } from "@/client/entities/agent";
import { DevPortBadges } from "@/client/entities/dev-ports";
import { gitGraphHref } from "@/client/entities/git-graph";
import { WorktreeCommandButtons } from "@/client/features/run-project-command";
import { ContextMenu, MenuItem, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import type { UserGroup } from "../model/canvasState";
import { CLUSTER_HEAD, GROUP_HEAD, PROJECT_HEAD, type Rect } from "../model/layout";

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
  /** The page to open while a question round waits for answers. */
  roundDoc: string | null;
  sessions: number;
  empty: boolean;
  onOpen: () => void;
  onOpenDoc: (target: string) => void;
}

const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();

/** A worktree as a dashed frame; dragging its header moves every session in it. */
export function ClusterFrame({ id, rect, worktree, steps, roundDoc, sessions, empty, onOpen, onOpenDoc }: ClusterFrameProps) {
  const [flowMenu, setFlowMenu] = useState<MenuPoint | null>(null);
  const current = steps?.findIndex((step) => step.status === "now" || step.status === "ask") ?? -1;
  const pr = worktree.pullRequest.kind === "found" ? worktree.pullRequest : null;
  const flowDocs = flowDocsOf(worktree.flowTasks[0]);
  const openFlow = (event: React.MouseEvent<HTMLButtonElement>) => {
    const [only] = flowDocs;
    if (flowDocs.length === 1 && only) {
      onOpenDoc(only.target);
      return;
    }
    setFlowMenu({ x: event.clientX, y: event.clientY });
  };
  const flowStatus = (
    <>
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
    </>
  );
  return (
    <g>
      <rect data-cluster={id} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={14} strokeDasharray="6 5" strokeWidth={1.3} className="fill-tint/40 stroke-faint" />
      <foreignObject x={rect.x} y={rect.y} width={rect.w} height={CLUSTER_HEAD}>
        <div data-drag="cluster" data-id={id} className="flex h-full cursor-grab items-center gap-2 px-4 text-[12px] leading-none select-none active:cursor-grabbing">
          <button
            type="button"
            onClick={() => window.open(gitGraphHref(worktree.path), "_blank", "noopener")}
            title="깃 그래프에서 커밋 흐름 보기"
            className="shrink-0 text-[10px] font-semibold tracking-[0.08em] text-muted underline decoration-faint underline-offset-[3px] hover:decoration-current"
          >
            {worktree.isMain ? "MAIN" : "WORKTREE"}
          </button>
          <span className="truncate font-bold">{worktree.name}</span>
          {flowDocs.length > 0 ? (
            <button
              type="button"
              onClick={openFlow}
              title={flowDocs.length === 1 ? "연결된 flow 문서 열기" : "연결된 flow 문서 고르기"}
              className="flex shrink-0 items-center gap-2 underline decoration-faint underline-offset-[3px] hover:decoration-current"
            >
              {flowStatus}
            </button>
          ) : (
            flowStatus
          )}
          {pr && (
            <button
              type="button"
              onClick={() => onOpenDoc(pr.url)}
              title="PR 열기"
              className="shrink-0 font-semibold text-pr underline decoration-faint underline-offset-[3px] hover:decoration-current"
            >
              PR #{pr.number}
            </button>
          )}
          <button type="button" onClick={onOpen} className="ml-auto shrink-0 text-muted underline decoration-faint underline-offset-[3px] hover:decoration-current">
            세션 {sessions}
          </button>
          <DevPortBadges worktreePath={worktree.path} />
          <WorktreeCommandButtons worktree={worktree} />
          {roundDoc && (
            <button
              type="button"
              onClick={() => onOpenDoc(roundDoc)}
              title="답을 기다리는 질문 라운드의 문서를 열어요"
              className="shrink-0 font-semibold text-ask underline decoration-faint underline-offset-[3px] hover:decoration-current"
            >
              문서 열기
            </button>
          )}
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
      {flowMenu &&
        createPortal(
          // Portaled to <body> so the menu is not clipped by the SVG; React events still bubble through the portal, so the canvas never sees them.
          <div onPointerDown={stopPropagation} onClick={stopPropagation}>
            <ContextMenu at={flowMenu} label="연결된 flow 문서" onClose={() => setFlowMenu(null)} widthClass="w-56">
              {flowDocs.map((doc) => (
                <MenuItem
                  key={doc.target}
                  onSelect={() => {
                    setFlowMenu(null);
                    onOpenDoc(doc.target);
                  }}
                >
                  {doc.label}
                </MenuItem>
              ))}
            </ContextMenu>
          </div>,
          document.body,
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

interface ProjectFrameProps {
  repo: string;
  rect: Rect;
  /** Sessions in this project's worktrees. */
  agents: AgentCard[];
  worktrees: number;
  onOpen?: () => void;
}

/** A project on the all-projects canvas, wrapped around its worktree frames; dragging its header moves all of them. */
export function ProjectFrame({ repo, rect, agents, worktrees, onOpen }: ProjectFrameProps) {
  const { restOf } = useRestOverrides();
  const states = agents.map((agent) => displayStateOf(agent, restOf));
  const myTurn = states.filter((state) => state === "done" || state === "blocked" || state === "waiting").length;
  const working = states.filter((state) => state === "working").length;
  return (
    <g>
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={22} strokeWidth={1.5} className="fill-tint/20 stroke-hair" />
      <foreignObject x={rect.x} y={rect.y} width={rect.w} height={PROJECT_HEAD}>
        <div data-drag="project" data-id={repo} className="flex h-full cursor-grab items-center gap-2.5 px-5 text-[12px] leading-none select-none active:cursor-grabbing">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-muted">PROJECT</span>
          <span className="max-w-full shrink-0 truncate text-[16px] font-bold">{repo}</span>
          <span className="min-w-0 truncate text-muted">
            워크트리 {worktrees} · 세션 {agents.length}
            {myTurn > 0 && <span className="font-semibold text-ask"> · 내 차례 {myTurn}</span>}
            {working > 0 && <span className="font-semibold text-now"> · 작업 중 {working}</span>}
          </span>
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              title={`${repo} 프로젝트 캔버스 열기`}
              className="ml-auto shrink-0 font-semibold underline decoration-faint underline-offset-[3px] hover:decoration-current"
            >
              열기
            </button>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

const CORNER = 14;

interface ResizeCornerProps {
  id: string;
  rect: Rect;
  label: string;
}

/**
 * The bottom-right handle that resizes a box or a frame; the canvas reads `data-resize` on pointer
 * down. Its grip shows while the pointer is over the surrounding `group/box`.
 */
export function ResizeCorner({ id, rect, label }: ResizeCornerProps) {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  return (
    <g data-resize={id} className="group/corner cursor-nwse-resize">
      <title>{`${label} · 두 번 누르면 원래 크기`}</title>
      <rect x={right - CORNER} y={bottom - CORNER} width={CORNER + 4} height={CORNER + 4} className="fill-transparent" />
      <path
        d={`M ${right - 3} ${bottom - 10} L ${right - 10} ${bottom - 3} M ${right - 3} ${bottom - 5.5} L ${right - 5.5} ${bottom - 3}`}
        strokeWidth={1.5}
        strokeLinecap="round"
        className="stroke-muted opacity-0 transition-opacity group-hover/box:opacity-100 group-hover/corner:stroke-fg"
      />
    </g>
  );
}
