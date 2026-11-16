"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import type { WorktreeOverlap } from "@/common/projectOverview/types";
import { buildSteps } from "@/common/workflow/steps";
import type { StepStatus, WorkflowMode } from "@/common/workflow/types";
import { groupAgents } from "@/client/entities/agent";
import { overlapsQueryOptions } from "@/client/entities/project-overview";
import { LaunchAgent } from "@/client/features/launch-agent";
import { formatElapsed } from "@/client/shared/lib/format";
import { ACTION_ICONS } from "@/client/shared/ui/ActionIcons";
import { edgeGeometry, type EdgeKind, type GraphEdge } from "../model/edges";
import { layoutGraph, type Box, type GraphLayout, type LaneLayout, type NodeLayout } from "../model/layout";
import { useViewport } from "../model/useViewport";

export interface ProjectGraphProps {
  worktrees: WorktreeSummary[];
  agents: AgentCard[];
  mode: WorkflowMode;
  now: number;
  isDismissed: (agent: AgentCard) => boolean;
  /** Session to select on arrival, e.g. after a jump from an alert. */
  focusId: string | null;
  /** Sessions drawn above the lanes. */
  top?: AgentCard[];
  /** Edges between sessions, from session id to session id, added to the worktree edges. */
  links?: { id: string; kind: EdgeKind; from: string; to: string; label: string | null }[];
  renderCard: (agent: AgentCard) => React.ReactNode;
  onOpenWorktree: (worktree: WorktreeSummary) => void;
  onAction: (action: ActionRequest) => Promise<void>;
  /** Extra toolbar buttons, drawn before the built-in ones. */
  tools?: React.ReactNode;
}

type Tone = "input" | "ask" | "now" | "rest";

function toneOf(agent: AgentCard): Tone {
  if (agent.state === "blocked" || agent.state === "waiting" || (agent.interrupted && agent.state !== "working")) return "input";
  if (agent.state === "working") return "now";
  if (agent.state === "done") return "ask";
  return "rest";
}

const TONE_LABEL: Record<Tone, (agent: AgentCard) => string> = {
  input: (agent) => (agent.state === "blocked" ? "막힘" : agent.interrupted && agent.state !== "waiting" ? "중단됨" : "내 입력 대기"),
  ask: (agent) => (agent.unread ? "새 결과" : "내 차례"),
  now: () => "작업 중",
  rest: () => "쉬는 중",
};

const TONE_NODE: Record<Tone, string> = {
  input: "bg-accent/12 shadow-[inset_0_0_0_1px_var(--accent)]",
  ask: "bg-ask/12 shadow-[inset_0_0_0_1px_var(--st-ask)]",
  now: "bg-now/12 shadow-[inset_0_0_0_1px_var(--st-now)]",
  rest: "bg-bg shadow-[inset_0_0_0_1px_var(--hair)]",
};

const TONE_TEXT: Record<Tone, string> = { input: "text-accent", ask: "text-ask", now: "text-now", rest: "text-muted" };
const TONE_DOT: Record<Tone, string> = { input: "bg-accent", ask: "bg-ask", now: "bg-now animate-pulse", rest: "shadow-[inset_0_0_0_1.5px_var(--faint)]" };
const TONE_RING: Record<Tone, string> = {
  input: "ring-accent/35",
  ask: "ring-ask/35",
  now: "ring-now/35",
  rest: "ring-faint/50",
};

const STEP_DOT: Record<StepStatus, string> = {
  done: "bg-done",
  now: "bg-now",
  ask: "bg-ask",
  wait: "bg-faint",
  skip: "bg-faint opacity-50",
};

const EDGE_CLASS: Record<EdgeKind, string> = {
  branch: "stroke-faint [stroke-dasharray:2_5]",
  overlap: "stroke-accent [stroke-dasharray:6_5]",
  delegate: "stroke-fg",
  report: "stroke-focus [stroke-dasharray:5_5]",
  next: "stroke-muted",
};

const EDGE_PILL: Record<EdgeKind, string> = {
  branch: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
  overlap: "text-accent shadow-[inset_0_0_0_1px_var(--accent)]",
  delegate: "text-fg shadow-[inset_0_0_0_1px_var(--faint)]",
  report: "text-focus shadow-[inset_0_0_0_1px_var(--focus)]",
  next: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
};

const ARROW: Partial<Record<EdgeKind, string>> = { delegate: "url(#pg-arrow-fg)", report: "url(#pg-arrow-focus)", next: "url(#pg-arrow-muted)" };

const LEGEND: { kind: EdgeKind; label: string }[] = [
  { kind: "delegate", label: "맡김" },
  { kind: "report", label: "보고" },
  { kind: "next", label: "끝나면 다음" },
  { kind: "branch", label: "갈라짐" },
  { kind: "overlap", label: "같은 파일" },
];

const PILL_W = 96;
const PILL_H = 20;

function orderedAgents(agents: AgentCard[], isDismissed: (agent: AgentCard) => boolean): AgentCard[] {
  const groups = groupAgents(agents, isDismissed);
  return [...groups.needsMe, ...groups.working, ...groups.resting];
}

/** Overlap lines are drawn only for the focused worktree; every pair at once would bury the graph. */
function worktreeEdges(layout: GraphLayout, overlaps: WorktreeOverlap[], focusPath: string | null): GraphEdge[] {
  const laneById = new Map(layout.lanes.map((lane) => [lane.worktree.worktreeId, lane]));
  const laneByPath = new Map(layout.lanes.map((lane) => [lane.worktree.path, lane]));
  const branches = layout.lanes.flatMap((lane): GraphEdge[] => {
    const parent = lane.worktree.parentWorktreeId ? laneById.get(lane.worktree.parentWorktreeId) : undefined;
    return parent ? [{ id: `branch:${lane.worktree.worktreeId}`, kind: "branch", from: parent, to: lane, label: null }] : [];
  });
  const focused = focusPath ? overlaps.filter((overlap) => overlap.a === focusPath || overlap.b === focusPath) : [];
  const shared = focused.flatMap((overlap): GraphEdge[] => {
    const a = laneByPath.get(overlap.a);
    const b = laneByPath.get(overlap.b);
    return a && b
      ? [{ id: `overlap:${overlap.a}:${overlap.b}`, kind: "overlap", from: a, to: b, label: `같은 파일 ${overlap.files.length}`, title: overlap.files.join("\n") }]
      : [];
  });
  return [...branches, ...shared];
}

function linkEdges(layout: GraphLayout, links: NonNullable<ProjectGraphProps["links"]>): GraphEdge[] {
  const nodeById = new Map<string, Box>(layout.nodes.map((node) => [node.agent.id, node]));
  return links.flatMap((link): GraphEdge[] => {
    const from = nodeById.get(link.from);
    const to = nodeById.get(link.to);
    return from && to ? [{ id: `link:${link.id}`, kind: link.kind, from, to, label: link.label }] : [];
  });
}

interface LaneProps {
  lane: LaneLayout;
  mode: WorkflowMode;
  count: number;
  overlapCount: number;
  overlapShown: boolean;
  onOpen: () => void;
  onToggleOverlap: () => void;
}

function Lane({ lane, mode, count, overlapCount, overlapShown, onOpen, onToggleOverlap }: LaneProps) {
  const { worktree } = lane;
  const task = worktree.flowTasks[0] ?? null;
  const steps = task ? buildSteps(mode, task, worktree.pullRequest) : [];
  const current = steps.findIndex((step) => step.status === "now" || step.status === "ask");
  const pr = worktree.pullRequest;
  return (
    <g>
      <rect
        x={lane.x}
        y={lane.y}
        width={lane.w}
        height={lane.h}
        rx={16}
        className="fill-tint-2/60 stroke-faint [stroke-dasharray:4_4]"
        strokeWidth={1}
      />
      <foreignObject x={lane.x} y={lane.y} width={lane.w} height={36}>
        <div className="flex h-9 items-center gap-2 px-4 font-mono text-[10px] font-semibold tracking-[0.06em] text-muted">
          <span className="uppercase">{worktree.isMain ? "main" : "worktree"}</span>
          <button
            type="button"
            onClick={onOpen}
            title="워크트리 화면 열기"
            className="truncate font-sans text-[12px] font-bold tracking-normal text-fg hover:underline"
          >
            {worktree.name}
          </button>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {steps.length > 0 && (
              <>
                <span className="flex gap-[3px]" aria-hidden>
                  {steps.map((step) => (
                    <span key={step.key} className={`size-[5px] rounded-full ${STEP_DOT[step.status]}`} />
                  ))}
                </span>
                {current >= 0 && (
                  <span>
                    {current + 1}/{steps.length} {steps[current]?.label}
                  </span>
                )}
              </>
            )}
            {pr.kind === "found" && <span className="text-pr">PR#{pr.number}</span>}
            {overlapCount > 0 && (
              <button
                type="button"
                aria-pressed={overlapShown}
                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  onToggleOverlap();
                }}
                title="같은 파일을 고치는 다른 워크트리를 선으로 보기"
                className={`rounded-full px-1.5 py-0.5 text-accent ${overlapShown ? "bg-accent/15" : "hover:bg-accent/10"}`}
              >
                ⇄{overlapCount}
              </button>
            )}
          </span>
        </div>
      </foreignObject>
      {count === 0 && (
        <foreignObject x={lane.x} y={lane.y + 36} width={lane.w} height={lane.h - 36}>
          <p className="px-4 pt-1 text-[12px] text-muted">세션 없음</p>
        </foreignObject>
      )}
    </g>
  );
}

interface SessionNodeProps {
  node: NodeLayout;
  now: number;
  selected: boolean;
  conductor: boolean;
  onSelect: () => void;
}

function SessionNode({ node, now, selected, conductor, onSelect }: SessionNodeProps) {
  const { agent } = node;
  const tone = toneOf(agent);
  const title = agent.title ?? agent.prompt ?? "새 세션";
  return (
    <foreignObject x={node.x - 6} y={node.y - 6} width={node.w + 12} height={node.h + 12}>
      <button
        type="button"
        data-node={agent.id}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          onSelect();
        }}
        className={`m-1.5 flex h-[74px] w-[184px] flex-col items-stretch rounded-[10px] px-3 py-2.5 text-left transition-shadow ${
          conductor ? "bg-focus/14 shadow-[inset_0_0_0_1px_var(--focus)]" : TONE_NODE[tone]
        } ${selected ? `ring-4 ${conductor ? "ring-focus/35" : TONE_RING[tone]}` : "hover:brightness-110"}`}
      >
        <span className={`flex items-center gap-1.5 font-mono text-[9.5px] leading-none font-semibold tracking-[0.08em] ${conductor ? "text-focus" : TONE_TEXT[tone]}`}>
          <span className={`size-[7px] shrink-0 rounded-full ${TONE_DOT[tone]}`} />
          {conductor ? `지휘자 · ${TONE_LABEL[tone](agent)}` : TONE_LABEL[tone](agent)}
          {agent.stateSince !== null && <span className="ml-auto tracking-normal text-faint">{formatElapsed(agent.stateSince, now)}</span>}
        </span>
        <span className="mt-2 truncate text-[13px] leading-tight font-semibold">{title}</span>
        <span className="mt-1 truncate text-[11.5px] leading-tight text-muted">{agent.lastMessage ?? agent.toolName ?? ""}</span>
      </button>
    </foreignObject>
  );
}

interface EdgeProps {
  edge: GraphEdge;
}

function Edge({ edge }: EdgeProps) {
  const geometry = edgeGeometry(edge);
  return (
    <g>
      <path d={geometry.d} className={`fill-none ${EDGE_CLASS[edge.kind]}`} strokeWidth={1.4} markerEnd={ARROW[edge.kind]} />
      {edge.label && (
        <foreignObject x={geometry.labelX - PILL_W / 2} y={geometry.labelY - PILL_H / 2} width={PILL_W} height={PILL_H}>
          <div className="flex h-5 justify-center">
            <span
              title={edge.title}
              className={`rounded-full bg-tint px-2 py-[3px] font-mono text-[10px] leading-none font-semibold whitespace-nowrap ${EDGE_PILL[edge.kind]}`}
            >
              {edge.label}
            </span>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

interface ArrowMarkerProps {
  id: string;
  className: string;
}

function ArrowMarker({ id, className }: ArrowMarkerProps) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
      <path d="M1 1L9 5L1 9" className={`fill-none ${className}`} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </marker>
  );
}

export function ProjectGraph({
  worktrees,
  agents,
  mode,
  now,
  isDismissed,
  focusId,
  top = [],
  links = [],
  renderCard,
  onOpenWorktree,
  onAction,
  tools,
}: ProjectGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [launching, setLaunching] = useState(false);
  const [laneFocus, setLaneFocus] = useState<string | null>(null);
  const projectPath = worktrees[0]?.projectPath ?? "";
  const overlaps = useQuery({ ...overlapsQueryOptions(projectPath), enabled: projectPath !== "" });
  const topIds = new Set(top.map((agent) => agent.id));
  const byWorktree = new Map<string, AgentCard[]>();
  for (const agent of agents) {
    if (topIds.has(agent.id)) continue;
    byWorktree.set(agent.worktreeId, [...(byWorktree.get(agent.worktreeId) ?? []), agent]);
  }
  const layout = layoutGraph({
    worktrees,
    agentsOf: (worktreeId) => orderedAgents(byWorktree.get(worktreeId) ?? [], isDismissed),
    top,
  });
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const focusPath = selected?.worktreePath ?? laneFocus;
  const overlapList = overlaps.data ?? [];
  const overlapCountOf = (worktreePath: string) => overlapList.filter((overlap) => overlap.a === worktreePath || overlap.b === worktreePath).length;
  const edges = [...worktreeEdges(layout, overlapList, focusPath), ...linkEdges(layout, links)];
  const { attach, transform, patternTransform, dragging, fit, zoomBy, onPointerDown, onPointerMove, onPointerUp } = useViewport(layout.width, layout.height);
  const selectedWorktree = selected ? worktrees.find((worktree) => worktree.worktreeId === selected.worktreeId) ?? null : null;
  const panelRef = useRef<HTMLElement | null>(null);

  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (focusId) setSelectedId(focusId);
  }

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      setSelectedId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const counts = groupAgents(agents, isDismissed);

  return (
    <div className="grid h-[calc(100dvh-7.5rem)] min-h-[520px] grid-cols-1 overflow-hidden rounded-2xl shadow-[inset_0_0_0_1px_var(--hair)] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative min-h-0 overflow-hidden bg-tint">
        <svg
          ref={attach}
          className={`size-full touch-none select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => {
            setSelectedId(null);
            setLaneFocus(null);
          }}
          role="img"
          aria-label="프로젝트 세션 그래프"
        >
          <defs>
            <pattern id="pg-dots" width={20} height={20} patternUnits="userSpaceOnUse" patternTransform={patternTransform}>
              <circle cx={1} cy={1} r={1} className="fill-faint/40" />
            </pattern>
            <ArrowMarker id="pg-arrow-fg" className="stroke-fg" />
            <ArrowMarker id="pg-arrow-focus" className="stroke-focus" />
            <ArrowMarker id="pg-arrow-muted" className="stroke-muted" />
          </defs>
          <rect width="100%" height="100%" fill="url(#pg-dots)" />
          <g transform={transform}>
            {layout.lanes.map((lane) => (
              <Lane
                key={lane.worktree.worktreeId}
                lane={lane}
                mode={mode}
                count={layout.nodes.filter((node) => node.laneId === lane.worktree.worktreeId).length}
                overlapCount={overlapCountOf(lane.worktree.path)}
                overlapShown={focusPath === lane.worktree.path}
                onOpen={() => onOpenWorktree(lane.worktree)}
                onToggleOverlap={() => {
                  setSelectedId(null);
                  setLaneFocus((current) => (current === lane.worktree.path ? null : lane.worktree.path));
                }}
              />
            ))}
            {edges.map((edge) => (
              <Edge key={edge.id} edge={edge} />
            ))}
            {layout.nodes.map((node) => (
              <SessionNode
                key={node.agent.id}
                node={node}
                now={now}
                selected={node.agent.id === selectedId}
                conductor={node.laneId === null}
                onSelect={() => setSelectedId(node.agent.id)}
              />
            ))}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-x-5 top-4 flex items-start gap-3">
          <p className="pointer-events-auto flex gap-3 rounded-lg bg-tint/85 px-3 py-1.5 font-mono text-[11px] font-medium text-muted backdrop-blur">
            <span>
              세션 <b className="text-fg">{agents.length}</b>
            </span>
            <span className="text-ask">
              내 차례 <b>{counts.needsMe.length}</b>
            </span>
            <span className="text-now">
              작업 중 <b>{counts.working.length}</b>
            </span>
          </p>
          <div className="pointer-events-auto ml-auto flex gap-0.5 rounded-[10px] bg-tint/85 p-1 shadow-[inset_0_0_0_1px_var(--hair)] backdrop-blur">
            {tools}
            <button
              type="button"
              aria-pressed={launching}
              onClick={() => setLaunching((open) => !open)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[11px] font-semibold ${
                launching ? "bg-fg text-bg" : "text-muted hover:text-fg"
              }`}
            >
              {ACTION_ICONS.session}새 세션
            </button>
            <button type="button" onClick={fit} className="rounded-md px-2.5 py-1.5 font-mono text-[11px] font-semibold text-muted hover:text-fg">
              맞춤
            </button>
          </div>
        </div>
        {launching && (
          <div className="absolute top-16 right-5 z-10 w-[min(560px,calc(100%-2.5rem))] rounded-xl bg-bg p-3 shadow-lg ring-1 ring-hair">
            <LaunchAgent worktrees={worktrees} showRepo={false} draftKey={`project:${projectPath}`} />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-5 bottom-4 flex items-end gap-3">
          <div className="pointer-events-auto flex flex-wrap gap-4 rounded-[10px] bg-tint/85 px-3.5 py-2 font-mono text-[10.5px] text-muted shadow-[inset_0_0_0_1px_var(--hair)] backdrop-blur">
            {LEGEND.map((item) => (
              <span key={item.kind} className="flex items-center gap-1.5">
                <svg width={26} height={10} aria-hidden>
                  <path d="M1 5H23" className={`fill-none ${EDGE_CLASS[item.kind]}`} strokeWidth={1.4} markerEnd={ARROW[item.kind]} />
                </svg>
                {item.label}
              </span>
            ))}
          </div>
          <div className="pointer-events-auto ml-auto flex flex-col overflow-hidden rounded-[10px] bg-tint/85 font-mono text-[13px] font-semibold text-muted shadow-[inset_0_0_0_1px_var(--hair)] backdrop-blur">
            <button type="button" aria-label="확대" onClick={() => zoomBy(1.2)} className="size-8 hover:text-fg">
              +
            </button>
            <button type="button" aria-label="축소" onClick={() => zoomBy(1 / 1.2)} className="size-8 border-t border-hair hover:text-fg">
              −
            </button>
          </div>
        </div>
      </div>

      <aside ref={panelRef} className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-hair bg-bg p-4 lg:border-t-0 lg:border-l">
        {selected ? (
          <>
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
              <span className="truncate">{selected.worktreeName}</span>
              {selectedWorktree && (
                <button type="button" onClick={() => onOpenWorktree(selectedWorktree)} className="ml-auto shrink-0 font-semibold hover:text-fg">
                  워크트리 열기 →
                </button>
              )}
            </div>
            {renderCard(selected)}
          </>
        ) : (
          <p className="m-auto max-w-[220px] text-center text-[13px] leading-relaxed text-muted">상자를 누르면 여기서 그 세션에 바로 답할 수 있어요.</p>
        )}
        {selected === null && agents.length === 0 && (
          <button
            type="button"
            onClick={() => worktrees[0] && void onAction({ type: "launch-agent", worktreePath: worktrees[0].path, prompt: "" })}
            className="mx-auto text-[12px] font-semibold text-muted hover:text-fg"
          >
            첫 세션 띄우기
          </button>
        )}
      </aside>
    </div>
  );
}
