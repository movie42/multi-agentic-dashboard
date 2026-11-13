"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { ConversationTurn } from "@/common/sessions/types";
import { conversationQueryOptions } from "@/client/entities/session";
import { formatClock } from "@/client/shared/lib/format";
import { StatusLine } from "@/client/shared/ui/StatusLine";
import { Markdown } from "@/client/shared/ui/Markdown";
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

export function TurnList({ sessionId }: TurnListProps) {
  const conversation = useQuery(conversationQueryOptions(sessionId));
  const listRef = useRef<HTMLOListElement>(null);
  const scrolledRef = useRef(false);
  const past = conversation.data ?? null;

  useEffect(() => {
    const list = listRef.current;
    if (!list || scrolledRef.current) return;
    list.scrollTop = list.scrollHeight;
    scrolledRef.current = true;
  }, [past]);

  if (conversation.error)
    return (
      <StatusLine error={conversation.error} label="대화 기록을 읽지 못했어요" />
    );
  if (!past) return <p className="text-[12px] text-muted">불러오는 중…</p>;
  if (past.length === 0) return <p className="text-[12px] text-muted">이전 대화가 없어요</p>;

  return (
    <ol ref={listRef} data-conversation-history className="flex max-h-[36rem] flex-col gap-0.5 overflow-y-auto">
      {past.map((turn) => (
        <TurnRow key={turn.id} turn={turn} />
      ))}
    </ol>
  );
}
