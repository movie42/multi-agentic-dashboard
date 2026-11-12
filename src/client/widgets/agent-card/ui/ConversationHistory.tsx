"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ConversationTurn } from "@/common/sessions/types";
import { conversationQueryOptions } from "@/client/entities/session";
import { formatClock } from "@/client/shared/lib/format";
import { StatusLine } from "@/client/shared/ui/StatusLine";
import { Markdown } from "./Markdown";
import { SlackCopyButton } from "./SlackCopyButton";

interface TurnRowProps {
  turn: ConversationTurn;
}

function TurnRow({ turn }: TurnRowProps) {
  const answerRef = useRef<HTMLDivElement>(null);

  return (
    <li>
      <details className="group/turn">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-tint-2">
          <span className="shrink-0 text-[10px] text-faint group-open/turn:rotate-90">▶</span>
          <span className="min-w-0 flex-1 truncate">{turn.prompt}</span>
          {turn.at && <span className="shrink-0 text-[12px] text-faint tabular-nums">{formatClock(turn.at)}</span>}
        </summary>
        <div className="mt-1 mb-2 flex flex-col gap-2 border-l-2 border-hair pl-3">
          <p className="rounded-lg bg-tint-2 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">{turn.prompt}</p>
          {turn.answer ? (
            <>
              <div ref={answerRef}>
                <Markdown text={turn.answer} />
              </div>
              <SlackCopyButton source={answerRef} plainText={turn.answer} />
            </>
          ) : (
            <p className="text-[12px] text-muted">답변 없이 끝났어요</p>
          )}
        </div>
      </details>
    </li>
  );
}

interface TurnListProps {
  sessionId: string;
}

function TurnList({ sessionId }: TurnListProps) {
  const conversation = useQuery(conversationQueryOptions(sessionId));
  const listRef = useRef<HTMLOListElement>(null);
  const scrolledRef = useRef(false);
  // The latest turn is already shown on the card as the current prompt and message.
  const past = conversation.data?.slice(0, -1) ?? null;

  useEffect(() => {
    const list = listRef.current;
    if (!list || scrolledRef.current) return;
    list.scrollTop = list.scrollHeight;
    scrolledRef.current = true;
  }, [past]);

  if (conversation.error)
    return (
      <div className="mt-2">
        <StatusLine error={conversation.error} label="대화 기록을 읽지 못했어요" />
      </div>
    );
  if (!past) return <p className="mt-2 text-[12px] text-muted">불러오는 중…</p>;
  if (past.length === 0) return <p className="mt-2 text-[12px] text-muted">이전 대화가 없어요</p>;

  return (
    <ol ref={listRef} className="mt-2 flex max-h-[32rem] flex-col gap-0.5 overflow-y-auto">
      {past.map((turn) => (
        <TurnRow key={turn.id} turn={turn} />
      ))}
    </ol>
  );
}

interface ConversationHistoryProps {
  sessionId: string;
}

export function ConversationHistory({ sessionId }: ConversationHistoryProps) {
  const [open, setOpen] = useState(false);

  return (
    <details className="group" onToggle={(event: React.SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer list-none text-[13px] text-muted hover:text-fg">
        <span className="group-open:hidden">이전 대화 보기 ▾</span>
        <span className="hidden group-open:inline">이전 대화 접기 ▴</span>
      </summary>
      {open && <TurnList sessionId={sessionId} />}
    </details>
  );
}
