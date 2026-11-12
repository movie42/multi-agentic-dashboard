"use client";

import { useState } from "react";
import type { AgentCard } from "@/common/orca/types";
import { ASK_USER_QUESTION } from "@/common/permissions/questions";
import { formatElapsed } from "@/client/shared/lib/format";
import { parseMessage } from "@/client/shared/lib/message";

const VISIBLE_LIMIT = 3;

interface InputAlertsProps {
  agents: AgentCard[];
  now: number;
  docOpen: boolean;
  onOpen: (agent: AgentCard) => void;
}

// A hidden alert comes back when the agent asks again: a new permission or a new state start changes the key.
const alertKey = (agent: AgentCard) => `${agent.id}:${agent.permission?.id ?? agent.stateSince ?? ""}`;

function reasonOf(agent: AgentCard): string {
  if (agent.permission) {
    return agent.permission.toolName === ASK_USER_QUESTION ? "질문" : `권한 요청 · ${agent.permission.toolName}`;
  }
  return agent.state === "blocked" ? "막힘" : "내 입력 대기";
}

const sinceOf = (agent: AgentCard) => agent.permission?.receivedAt ?? agent.stateSince;

interface AlertItemProps {
  agent: AgentCard;
  now: number;
  onOpen: () => void;
  onHide: () => void;
}

function AlertItem({ agent, now, onOpen, onHide }: AlertItemProps) {
  const lead = parseMessage(agent.lastMessage)?.lead ?? agent.title ?? agent.prompt ?? "";
  return (
    <li className="flex items-stretch overflow-hidden rounded-[10px] bg-fg text-bg shadow-lg shadow-[inset_3px_0_0_var(--accent)]">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 px-4 py-3 text-left hover:bg-bg/10">
        <span className="flex items-center gap-2 text-[11px] font-semibold">
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
          <span className="truncate">{reasonOf(agent)}</span>
          <span className="ml-auto shrink-0 opacity-60">{formatElapsed(sinceOf(agent), now)}</span>
        </span>
        <span className="mt-1 block truncate text-[13px] font-semibold">
          {agent.repo} · {agent.worktreeName}
        </span>
        {lead && <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug opacity-70">{lead}</span>}
      </button>
      <button
        type="button"
        onClick={onHide}
        aria-label="이 알림 숨기기"
        className="shrink-0 px-3 text-[12px] opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </li>
  );
}

export function InputAlerts({ agents, now, docOpen, onOpen }: InputAlertsProps) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const shown = agents
    .filter((agent) => !hidden.has(alertKey(agent)))
    .sort((a, b) => (sinceOf(a) ?? Number.MAX_SAFE_INTEGER) - (sinceOf(b) ?? Number.MAX_SAFE_INTEGER));
  if (shown.length === 0) return null;

  const listed = expanded ? shown : shown.slice(0, VISIBLE_LIMIT);
  const rest = shown.length - listed.length;
  const hide = (agent: AgentCard) => setHidden((previous) => new Set([...previous, alertKey(agent)]));

  return (
    <ul
      aria-label="입력이 필요한 세션"
      className={`fixed top-4 z-40 flex max-h-[calc(100vh-32px)] w-[min(340px,calc(100vw-32px))] flex-col gap-2 overflow-y-auto ${
        docOpen ? "right-[calc(var(--doc-panel-w,50vw)+16px)]" : "right-4"
      }`}
    >
      {listed.map((agent) => (
        <AlertItem key={agent.id} agent={agent} now={now} onOpen={() => onOpen(agent)} onHide={() => hide(agent)} />
      ))}
      {(rest > 0 || expanded) && shown.length > VISIBLE_LIMIT && (
        <li>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="w-full rounded-[10px] bg-fg/85 px-4 py-2 text-left text-[12px] font-semibold text-bg hover:bg-fg"
          >
            {expanded ? "접기" : `입력 대기 ${rest}개 더 보기`}
          </button>
        </li>
      )}
    </ul>
  );
}
