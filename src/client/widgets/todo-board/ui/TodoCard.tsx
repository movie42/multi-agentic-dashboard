"use client";

import type { TodoCard as TodoCardData, TodoJiraStatuses, TodoStatus } from "@/common/todos/types";
import { StateBadge } from "@/client/entities/agent";
import { AGENT_MARK_MS, CARD_DRAG_TYPE, type StatusTone, TONE_CHIP } from "../model/kinds";
import { type CardContext, pullRequestLabel } from "../model/cardContext";
import type { SessionLookup } from "../model/sessions";

interface TodoCardProps {
  card: TodoCardData;
  status: TodoStatus | undefined;
  tone: StatusTone;
  now: number;
  sessionOf: SessionLookup;
  context: CardContext;
  jiraStatuses: TodoJiraStatuses;
  onOpen: (cardId: string) => void;
}

const STOP = (event: React.MouseEvent<HTMLAnchorElement>) => event.stopPropagation();

function memoLead(memo: string): string {
  const line = memo.split("\n").find((each) => each.trim()) ?? "";
  return line.replace(/^[#>\-*\s]+/, "").trim();
}

export function TodoCard({ card, status, tone, now, sessionOf, context, jiraStatuses, onOpen }: TodoCardProps) {
  const sessions = card.sessionIds.map(sessionOf);
  const live = sessions.filter((session) => session.agent !== null);
  const closed = sessions.length - live.length;
  const agentMoved = card.agentMovedAt !== null && now - card.agentMovedAt < AGENT_MARK_MS;
  const lead = memoLead(card.memo);
  const { pullRequest, flowTasks, worktree } = context;
  const flow = flowTasks[0];

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-todo-card={card.id}
      aria-label={card.title}
      onDragStart={(event: React.DragEvent<HTMLDivElement>) => {
        event.dataTransfer.setData(CARD_DRAG_TYPE, card.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(card.id)}
      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(card.id);
        }
      }}
      className={`flex cursor-grab flex-col gap-2 rounded-[10px] bg-bg p-3 text-left shadow-[inset_0_0_0_1px_var(--hair)] outline-none hover:shadow-[inset_0_0_0_1.5px_var(--faint)] focus-visible:shadow-[inset_0_0_0_2px_var(--focus)] active:cursor-grabbing ${
        card.hidden ? "opacity-60" : ""
      }`}
    >
      <p className="line-clamp-2 text-[14px] leading-snug font-semibold">{card.title}</p>
      {lead && <p className="line-clamp-1 text-[12px] text-muted">{lead}</p>}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-none font-semibold">
        {status && <span className={`rounded-full px-2 py-1 ${TONE_CHIP[tone]}`}>{status.name}</span>}
        {card.repo && (
          <span className="rounded-full bg-tint px-2 py-1 text-muted">{worktree && !worktree.isMain ? `${card.repo} · ${worktree.name}` : card.repo}</span>
        )}
        {card.jira.map((jira) => (
          <a
            key={jira.key}
            href={jira.url}
            target="_blank"
            rel="noreferrer"
            draggable={false}
            onClick={STOP}
            className="rounded-full bg-tint-2 px-2 py-1 text-fg hover:underline"
          >
            <span className="font-mono">{jira.key}</span>
            {jiraStatuses[jira.key] && <span className="ml-1 font-normal text-muted">{jiraStatuses[jira.key]}</span>}
          </a>
        ))}
        {pullRequest && (
          <a
            href={pullRequest.url}
            target="_blank"
            rel="noreferrer"
            draggable={false}
            onClick={STOP}
            className={`rounded-full px-2 py-1 shadow-[inset_0_0_0_1px_var(--hair)] hover:underline ${pullRequest.state === "MERGED" ? "text-done" : "text-fg"}`}
          >
            {pullRequestLabel(pullRequest)}
          </a>
        )}
        {flow && (
          <span className="rounded-full bg-tint px-2 py-1 font-normal text-muted" title={flow.task.title}>
            {`flow · ${flow.step ?? "완료"}`}
          </span>
        )}
        {card.links.length > 0 && <span className="font-normal text-muted">{`링크 ${card.links.length}`}</span>}
        {agentMoved && <span className="rounded-full px-2 py-1 text-focus shadow-[inset_0_0_0_1px_var(--focus)]">에이전트가 옮김</span>}
        {card.doneSuggestedAt !== null && tone !== "last" && <span className="rounded-full bg-done/15 px-2 py-1 text-done">끝으로 옮겨도 될 것 같아요</span>}
        {card.hidden && <span className="text-muted">숨김</span>}
      </div>
      {(live.length > 0 || closed > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {live.map((session) => session.agent && <StateBadge key={session.id} agent={session.agent} />)}
          {closed > 0 && <span className="text-[11px] text-muted">지난 세션 {closed}</span>}
        </div>
      )}
    </div>
  );
}
