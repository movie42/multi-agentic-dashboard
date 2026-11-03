"use client";

import { useState } from "react";
import type { AgentCard } from "@/lib/orca/types";
import { StateBadge } from "./AgentCardView";
import { formatElapsed } from "./format";
import { parseMessage } from "./message";
import { QuickReply } from "./QuickReply";

interface AgentListProps {
  agents: AgentCard[];
  now: number;
  showRepo: boolean;
  renderCard: (agent: AgentCard) => React.ReactNode;
  expandedId?: string | null;
  onJump?: (agent: AgentCard) => void;
}

export function AgentList({ agents, now, showRepo, renderCard, expandedId = null, onJump }: AgentListProps) {
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
}

function AgentRow({ agent, now, showRepo, renderCard, initiallyExpanded, onJump }: AgentRowProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [replying, setReplying] = useState(false);
  const working = agent.state === "working";
  const files = agent.artifacts.filter((artifact) => artifact.kind !== "pr").length;
  const terminalHandle = agent.terminalHandle;

  return (
    <li data-jump={agent.id} className="scroll-mt-6 border-b border-hair">
      <div className="flex items-center gap-2 hover:bg-tint">
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
          {files > 0 && <span className="text-[12px] text-muted">산출물 {files}</span>}
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
    </li>
  );
}
