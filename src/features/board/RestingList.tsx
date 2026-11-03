"use client";

import type { AgentCard } from "@/lib/orca/types";
import { StateBadge } from "./AgentCardView";
import { formatElapsed } from "./format";
import { parseMessage } from "./message";

interface RestingListProps {
  agents: AgentCard[];
  now: number;
  showRepo: boolean;
  renderCard: (agent: AgentCard) => React.ReactNode;
}

export function RestingList({ agents, now, showRepo, renderCard }: RestingListProps) {
  return (
    <ul className="border-t border-hair">
      {agents.map((agent) => (
        <li key={agent.id} className="border-b border-hair">
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-3 py-3 text-[14px] hover:bg-tint">
              <StateBadge agent={agent} />
              {showRepo && (
                <span className="w-56 shrink-0 truncate font-semibold">
                  {agent.repo}
                  <span className="font-normal text-muted"> / {agent.worktreeName}</span>
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-muted">
                {parseMessage(agent.lastMessage)?.lead ?? agent.prompt}
              </span>
              {agent.artifacts.some((artifact) => artifact.kind !== "pr") && (
                <span className="text-[12px] text-muted">산출물 {agent.artifacts.filter((artifact) => artifact.kind !== "pr").length}</span>
              )}
              <span className="w-20 shrink-0 text-right text-[12px] text-muted">
                {formatElapsed(agent.updatedAt, now)} 전
              </span>
            </summary>
            <div className="pb-4">{renderCard(agent)}</div>
          </details>
        </li>
      ))}
    </ul>
  );
}
