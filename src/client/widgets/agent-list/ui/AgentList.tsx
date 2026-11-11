"use client";

import { useState } from "react";
import type { AgentCard } from "@/common/orca/types";
import { StateBadge } from "@/client/entities/agent";
import { formatElapsed } from "@/client/shared/lib/format";
import { parseMessage } from "@/client/shared/lib/message";
import { QuickReply } from "@/client/features/quick-reply";
import { BookmarkMark, bookmarkTarget } from "@/client/features/bookmark-session";

interface AgentListProps {
  agents: AgentCard[];
  now: number;
  showRepo: boolean;
  renderCard: (agent: AgentCard) => React.ReactNode;
  expandedId?: string | null;
  onJump?: (agent: AgentCard) => void;
  workersOf?: (agent: AgentCard) => AgentCard[];
  onReorder?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
}

const SESSION_DRAG_TYPE = "application/x-agent-control-session";

type DropEdge = "before" | "after";

const DROP_EDGE_CLASS: Record<DropEdge, string> = {
  before: "shadow-[inset_0_2px_0_0_var(--focus)]",
  after: "shadow-[inset_0_-2px_0_0_var(--focus)]",
};

function GripIcon() {
  return (
    <svg aria-hidden viewBox="0 0 10 16" className="h-3.5 w-2 fill-current">
      {[3, 8, 13].flatMap((cy) => [3, 7].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.4} />))}
    </svg>
  );
}

export function AgentList({ agents, now, showRepo, renderCard, expandedId = null, onJump, workersOf, onReorder }: AgentListProps) {
  return (
    <ul className="border-t border-hair">
      {agents.map((agent) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          now={now}
          showRepo={showRepo}
          renderCard={renderCard}
          initiallyExpanded={agent.id === expandedId}
          onJump={onJump}
          workers={workersOf?.(agent) ?? []}
          onReorder={onReorder}
        />
      ))}
    </ul>
  );
}

interface AgentRowProps {
  agent: AgentCard;
  now: number;
  showRepo: boolean;
  renderCard: (agent: AgentCard) => React.ReactNode;
  initiallyExpanded: boolean;
  onJump?: (agent: AgentCard) => void;
  workers: AgentCard[];
  onReorder?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
}

function AgentRow({ agent, now, showRepo, renderCard, initiallyExpanded, onJump, workers, onReorder }: AgentRowProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [dropEdge, setDropEdge] = useState<DropEdge | null>(null);
  const edgeOf = (event: React.DragEvent<HTMLElement>): DropEdge => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };
  const [replying, setReplying] = useState(false);
  const working = agent.state === "working";
  const files = agent.artifacts.filter((artifact) => artifact.kind !== "pr").length;
  const terminalHandle = agent.terminalHandle;
  const workersBusy = workers.filter((worker) => worker.state === "working").length;

  return (
    <li
      data-jump={agent.id}
      onDragOver={(event: React.DragEvent<HTMLLIElement>) => {
        if (!onReorder || !event.dataTransfer.types.includes(SESSION_DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setDropEdge(edgeOf(event));
      }}
      onDragLeave={(event: React.DragEvent<HTMLLIElement>) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setDropEdge(null);
      }}
      onDrop={(event: React.DragEvent<HTMLLIElement>) => {
        setDropEdge(null);
        const draggedId = event.dataTransfer.getData(SESSION_DRAG_TYPE);
        if (!onReorder || !draggedId) return;
        event.preventDefault();
        event.stopPropagation();
        if (draggedId !== agent.id) onReorder(draggedId, agent.id, edgeOf(event) === "after");
      }}
      className={`scroll-mt-6 border-b border-hair ${dropEdge ? DROP_EDGE_CLASS[dropEdge] : ""}`}
    >
      <div className="group flex items-center gap-2 hover:bg-tint">
        {onReorder && (
          <span
            draggable
            onDragStart={(event: React.DragEvent<HTMLSpanElement>) => {
              event.dataTransfer.setData(SESSION_DRAG_TYPE, agent.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            title="끌어서 세션 순서를 바꿔요"
            className="-mr-1 flex shrink-0 cursor-grab self-stretch items-center px-1 text-faint group-hover:text-muted active:cursor-grabbing"
          >
            <GripIcon />
          </span>
        )}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left text-[14px]"
        >
          <StateBadge agent={agent} />
          {showRepo && (
            <span className="w-56 shrink-0 truncate font-semibold">
              {agent.repo}
              <span className="font-normal text-muted"> / {agent.worktreeName}</span>
            </span>
          )}
          {agent.unread && <span className="size-2 shrink-0 rounded-full bg-accent" title="새 결과" />}
          <span className="min-w-0 flex-1 truncate text-muted">
            {agent.session?.title && <span className="font-semibold text-fg">{agent.session.title} · </span>}
            {parseMessage(agent.lastMessage)?.lead ?? agent.prompt}
          </span>
          {workers.length > 0 && (
            <span className="shrink-0 text-[12px] text-muted" title="이 세션이 오케스트레이션으로 띄운 작업 세션">
              작업 세션 {workers.length}
              {workersBusy > 0 && <span className="text-now"> · 작업 중 {workersBusy}</span>}
            </span>
          )}
          {files > 0 && <span className="text-[12px] text-muted">산출물 {files}</span>}
          {agent.session && (
            <BookmarkMark
              target={bookmarkTarget(agent.session.id, agent.session.title ?? "", agent.worktreePath, agent.session.bookmark)}
            />
          )}
          <span className="w-20 shrink-0 text-right text-[12px] text-muted">
            {working ? `${formatElapsed(agent.stateSince, now)} 경과` : `${formatElapsed(agent.updatedAt, now)} 전`}
          </span>
        </button>
        {terminalHandle && !expanded && (
          <button
            type="button"
            aria-pressed={replying}
            onClick={() => setReplying(!replying)}
            className={`shrink-0 rounded-full px-3 py-1 text-[12px] leading-5 font-semibold ${
              replying ? "bg-fg text-bg" : "text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg"
            }`}
          >
            답장
          </button>
        )}
        {onJump && (
          <button
            type="button"
            onClick={() => onJump(agent)}
            title="이 프로젝트 화면에서 열기"
            className="shrink-0 rounded-full px-3 py-1 text-[12px] leading-5 font-semibold text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg"
          >
            이동 →
          </button>
        )}
      </div>
      {terminalHandle && replying && !expanded && (
        <div className="pb-3">
          <QuickReply terminalHandle={terminalHandle} working={working} autoFocus />
        </div>
      )}
      {expanded && <div className="pb-4">{renderCard(agent)}</div>}
      {expanded && workers.length > 0 && (
        <div className="mb-4 ml-6">
          <AgentList agents={workers} now={now} showRepo={showRepo} renderCard={renderCard} />
        </div>
      )}
    </li>
  );
}
