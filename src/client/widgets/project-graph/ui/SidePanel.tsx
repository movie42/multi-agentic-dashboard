"use client";

import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard } from "@/common/board/types";
import { ACTION_ICONS } from "@/client/shared/ui/ActionIcons";
import type { GraphEdge, ProjectGraph } from "../model/graph";
import { EDGE_STYLE } from "./GraphEdges";
import { nodeTitle } from "./NodeBox";

const LINK_TEXT = { delegate: "맡김", report: "끝나면 보고", next: "끝나면 다음" } as const;

const PILL =
  "shrink-0 rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint";

interface ConnectionListProps {
  graph: ProjectGraph;
  edges: GraphEdge[];
  /** The session the list is read from; without one every line shows both ends. */
  focusId: string | null;
  onAction: (action: ActionRequest) => Promise<void>;
}

/** Lines between sessions with what can be done to each: resume a stopped line, unlink. */
export function ConnectionList({ graph, edges, focusId, onAction }: ConnectionListProps) {
  const name = (id: string) => {
    const agent = graph.nodes.get(id)?.agent;
    return agent ? `${nodeTitle(agent)} · ${agent.worktreeName}` : id;
  };
  if (edges.length === 0) {
    return <p className="text-[13px] text-muted">이어진 세션이 없어요. 도구 막대의 &lsquo;잇기&rsquo;로 상자끼리 이을 수 있어요.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {edges.map((edge) => {
        const kind = edge.kind === "delegate" || edge.kind === "report" || edge.kind === "next" ? edge.kind : null;
        if (!kind || !edge.linkId) return null;
        const linkId = edge.linkId;
        const outgoing = edge.from === focusId;
        const text =
          focusId === null ? `${name(edge.from)} → ${name(edge.to)}` : outgoing ? `→ ${name(edge.to)}` : `← ${name(edge.from)}`;
        return (
          <li key={edge.id} className="flex items-center gap-2 text-[13px]">
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
  | { kind: "all" };

interface SidePanelProps {
  graph: ProjectGraph;
  view: PanelView;
  renderCard: (agent: AgentCard) => React.ReactNode;
  onAction: (action: ActionRequest) => Promise<void>;
  onOpenWorktree: (worktreeId: string) => void;
  onCollapse: () => void;
}

const HEADING = "text-[11px] font-semibold tracking-[0.08em] text-muted";
const FOOT_BUTTON =
  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint";

/** Answer the selected session in place, see its lines, one line, or every line of the project. */
export function SidePanel({ graph, view, renderCard, onAction, onOpenWorktree, onCollapse }: SidePanelProps) {
  const links = graph.edges.filter((edge) => edge.linkId !== null);
  const agent = view.kind === "agent" ? view.agent : null;
  return (
    <aside data-scroll className="relative flex h-full w-[min(440px,40vw)] shrink-0 flex-col border-l border-hair bg-bg">
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
        {view.kind === "edge" && (
          <section className="flex flex-col gap-3">
            <p className={HEADING}>고른 연결</p>
            <ConnectionList graph={graph} edges={[view.edge]} focusId={null} onAction={onAction} />
          </section>
        )}
        {view.kind === "many" && (
          <p className="pt-10 text-center text-[14px] text-muted">
            상자 {view.count}개를 골랐어요.
            <br />
            ⌘G로 그룹으로 묶을 수 있어요.
          </p>
        )}
        {view.kind === "empty" && <p className="pt-10 text-center text-[14px] text-muted">상자를 누르면 여기서 답할 수 있어요.</p>}
        {agent && (
          <div className="flex flex-col gap-5">
            <p className="truncate text-[12px] text-muted">
              {agent.repo} / <span className="font-semibold text-fg">{agent.worktreeName}</span>
            </p>
            {renderCard(agent)}
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
