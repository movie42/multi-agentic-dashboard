"use client";

import { useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard } from "@/common/board/types";
import { ACTION_ICONS } from "@/client/shared/ui/ActionIcons";
import { ResizeHandle } from "@/client/shared/ui/ResizeHandle";
import { paneWidth } from "@/client/shared/lib/paneWidth";
import type { TemplateRun } from "@/common/templates/types";
import { runOfNode, type GraphEdge, type ProjectGraph } from "../model/graph";
import { EDGE_STYLE } from "./GraphEdges";
import { nodeTitle } from "./NodeBox";
import { RouteEditor } from "./RouteEditor";
import { RunPanel } from "./RunPanel";
import { appendDictation, DictationButton } from "@/client/shared/ui/DictationButton";

const MIN_PANEL = 320;
/** Room the canvas keeps when the panel is dragged wide. */
const MIN_CANVAS = 400;

const LINK_TEXT = { delegate: "맡김", report: "끝나면 보고", next: "끝나면 다음" } as const;

const PILL =
  "shrink-0 rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint";

interface ConnectionListProps {
  graph: ProjectGraph;
  edges: GraphEdge[];
  /** The session the list is read from; without one every line shows both ends. */
  focusId: string | null;
  /** Open each line's text editor right away, for the view of one chosen line. */
  editing?: boolean;
  onAction: (action: ActionRequest) => Promise<void>;
}

interface LinkPromptProps {
  edge: GraphEdge & { kind: "delegate" | "next"; linkId: string };
  startOpen: boolean;
  onAction: (action: ActionRequest) => Promise<void>;
}

/** What a delegate line handed over, or what a next line will send; editable in place. */
function LinkPrompt({ edge, startOpen, onAction }: LinkPromptProps) {
  const [draft, setDraft] = useState<string | null>(startOpen ? (edge.prompt ?? "") : null);
  const [saving, setSaving] = useState(false);
  const delegate = edge.kind === "delegate";
  const empty = delegate ? "맡긴 내용이 없어요." : "비어 있어요 · 앞 세션의 마지막 답만 보내요.";

  const save = async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      await onAction({ type: "edit-link", linkId: edge.linkId, prompt: draft.trim() ? draft : null });
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  if (draft === null) {
    return (
      <div className="flex items-start gap-2 pl-1">
        <p className={`line-clamp-3 min-w-0 flex-1 text-[12px] whitespace-pre-wrap ${edge.prompt ? "text-fg" : "text-muted"}`}>{edge.prompt ?? empty}</p>
        <button type="button" onClick={() => setDraft(edge.prompt ?? "")} className={PILL}>
          고치기
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 pl-1">
      <div className="flex items-end gap-1.5">
        <textarea
          rows={4}
          autoFocus={!startOpen}
          value={draft}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
          placeholder={delegate ? "무엇을 맡길까요?" : "뒤 세션에 보낼 말 · 비우면 앞 세션의 마지막 답을 넣어요"}
          className="min-w-0 flex-1 resize-y rounded-[8px] bg-tint px-2.5 py-2 text-[13px] outline-none placeholder:text-muted"
        />
        <DictationButton onText={(text) => setDraft(appendDictation(draft, text))} />
      </div>
      <p className="text-[11px] text-muted">
        {delegate ? "아직 전달 전이면 고친 내용으로 바꾸고, 이미 전달됐으면 고친 내용을 이어서 보내요. 맡은 세션이 일하는 중이면 그 턴이 끝난 뒤 들어가요." : "다음에 앞 세션이 턴을 마칠 때부터 고친 말을 보내요."}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || (delegate && !draft.trim()) || draft === (edge.prompt ?? "")}
          onClick={() => void save()}
          className="rounded-full bg-fg px-3.5 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30"
        >
          {delegate ? "고쳐서 다시 보내기" : "저장"}
        </button>
        <button type="button" onClick={() => setDraft(null)} className={PILL}>
          취소
        </button>
      </div>
    </div>
  );
}

/** Lines between sessions with what can be done to each: resume a stopped line, unlink. */
export function ConnectionList({ graph, edges, focusId, editing = false, onAction }: ConnectionListProps) {
  const name = (id: string) => {
    const agent = graph.nodes.get(id)?.agent;
    return agent ? `${nodeTitle(agent)} · ${agent.worktreeName}` : id;
  };
  if (edges.length === 0) {
    return <p className="text-[13px] text-muted">이어진 세션이 없어요. 도구 막대의 &lsquo;잇기&rsquo;로 상자끼리 이을 수 있어요.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {edges.map((edge) => {
        const kind = edge.kind === "delegate" || edge.kind === "report" || edge.kind === "next" ? edge.kind : null;
        if (!kind || !edge.linkId) return null;
        const linkId = edge.linkId;
        const outgoing = edge.from === focusId;
        const text =
          focusId === null ? `${name(edge.from)} → ${name(edge.to)}` : outgoing ? `→ ${name(edge.to)}` : `← ${name(edge.from)}`;
        return (
          <li key={edge.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[13px]">
              <span className={`shrink-0 font-semibold ${edge.paused ? "text-accent" : EDGE_STYLE[kind].pill}`}>
                {LINK_TEXT[kind]}
                {edge.paused && " · 멈춤"}
              </span>
              <span className="min-w-0 flex-1 truncate">{text}</span>
              {edge.paused && (
                <button type="button" onClick={() => void onAction({ type: "resume-link", linkId })} className={PILL}>
                  다시 켜기
                </button>
              )}
              <button type="button" onClick={() => void onAction({ type: "unlink-sessions", linkId })} className={`${PILL} text-accent`}>
                끊기
              </button>
            </div>
            {kind !== "report" && <LinkPrompt edge={{ ...edge, kind, linkId }} startOpen={editing} onAction={onAction} />}
          </li>
        );
      })}
    </ul>
  );
}

export type PanelView =
  | { kind: "empty" }
  | { kind: "agent"; agent: AgentCard }
  | { kind: "many"; count: number }
  | { kind: "edge"; edge: GraphEdge }
  | { kind: "run"; run: TemplateRun; cardKey: string }
  | { kind: "all" };

interface SidePanelProps {
  graph: ProjectGraph;
  view: PanelView;
  renderCard: (agent: AgentCard) => React.ReactNode;
  onAction: (action: ActionRequest) => Promise<void>;
  onOpenWorktree: (worktreeId: string) => void;
  onEditRun: (run: TemplateRun) => void;
  onCollapse: () => void;
}

const HEADING = "text-[11px] font-semibold tracking-[0.08em] text-muted";
const FOOT_BUTTON =
  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint";

/** Answer the selected session in place, see its lines, one line, or every line of the project. */
export function SidePanel({ graph, view, renderCard, onAction, onOpenWorktree, onEditRun, onCollapse }: SidePanelProps) {
  const links = graph.edges.filter((edge) => edge.linkId !== null);
  const routeEdge = view.kind === "edge" ? view.edge.route : undefined;
  const routeRun = routeEdge ? graph.runs.find((run) => run.id === routeEdge.runId) : undefined;
  const agent = view.kind === "agent" ? view.agent : null;
  const agentRun = agent ? runOfNode(graph.runs, agent.id) : null;
  return (
    <aside data-scroll className="relative flex h-full w-[var(--canvas-panel-w,440px)] shrink-0 flex-col border-l border-hair bg-bg">
      <ResizeHandle
        cssVar="--canvas-panel-w"
        storageKey="agent-control:canvas-panel-width"
        edge="left"
        defaultWidth={() => Math.min(440, window.innerWidth * 0.4)}
        min={MIN_PANEL}
        max={() => window.innerWidth - paneWidth("--sidebar-w", 0) - MIN_CANVAS}
        label="오른쪽 패널 크기 조절"
        className="absolute inset-y-0 -left-1 z-20"
      />
      <button
        type="button"
        onClick={onCollapse}
        title="오른쪽 패널 접기"
        aria-label="오른쪽 패널 접기"
        className="absolute top-3 left-2 z-10 flex size-7 items-center justify-center rounded-md text-[15px] text-muted hover:bg-tint hover:text-fg"
      >
        »
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-11 pb-4">
        {view.kind === "all" && (
          <section className="flex flex-col gap-3">
            <p className={HEADING}>이 프로젝트의 연결 · 규칙</p>
            <p className="text-[12px] text-muted">끝나면 보고 · 끝나면 다음 선은 세션이 한 턴을 마칠 때 데몬이 실행해요. 같은 두 세션 사이를 세 번 오가면 멈춰요.</p>
            <ConnectionList graph={graph} edges={links} focusId={null} onAction={onAction} />
          </section>
        )}
        {routeEdge && routeRun && <RouteEditor key={`${routeRun.id}:${routeEdge.routeId}`} run={routeRun} routeId={routeEdge.routeId} onEditRun={onEditRun} />}
        {view.kind === "edge" && !routeEdge && (
          <section className="flex flex-col gap-3">
            <p className={HEADING}>고른 연결</p>
            <ConnectionList key={view.edge.id} graph={graph} edges={[view.edge]} focusId={null} editing onAction={onAction} />
          </section>
        )}
        {view.kind === "many" && (
          <p className="pt-10 text-center text-[14px] text-muted">
            상자 {view.count}개를 골랐어요.
            <br />
            ⌘G로 그룹으로 묶을 수 있어요.
          </p>
        )}
        {view.kind === "run" && <RunPanel key={view.run.id} run={view.run} focusKey={view.cardKey} onEdit={onEditRun} />}
        {view.kind === "empty" && <p className="pt-10 text-center text-[14px] text-muted">상자를 누르면 여기서 답할 수 있어요.</p>}
        {agent && (
          <div className="flex flex-col gap-5">
            <p className="truncate text-[12px] text-muted">
              {agent.repo} / <span className="font-semibold text-fg">{agent.worktreeName}</span>
            </p>
            {renderCard(agent)}
            {agentRun && (
              <div className="border-t border-hair pt-4">
                <RunPanel
                  key={agentRun.id}
                  run={agentRun}
                  focusKey={Object.entries(agentRun.sessions).find(([, id]) => id === agent.id)?.[0] ?? null}
                  onEdit={onEditRun}
                />
              </div>
            )}
            <section className="flex flex-col gap-2 border-t border-hair pt-4">
              <p className={HEADING}>연결</p>
              <ConnectionList graph={graph} edges={links.filter((edge) => edge.from === agent.id || edge.to === agent.id)} focusId={agent.id} onAction={onAction} />
            </section>
          </div>
        )}
      </div>
      {agent && (
        <div className="flex gap-2 border-t border-hair px-5 py-3">
          <button type="button" onClick={() => onOpenWorktree(agent.worktreeId)} className={FOOT_BUTTON}>
            {ACTION_ICONS.worktree}
            워크트리 열기
          </button>
          <button type="button" onClick={() => void onAction({ type: "open-terminal", worktreePath: agent.worktreePath })} className={FOOT_BUTTON}>
            {ACTION_ICONS.terminal}
            터미널
          </button>
        </div>
      )}
    </aside>
  );
}
