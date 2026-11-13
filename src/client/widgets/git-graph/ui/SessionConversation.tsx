"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { conversationQueryOptions } from "@/client/entities/session";
import { formatClock, plainMessage } from "@/client/shared/lib/format";
import { Markdown } from "@/client/shared/ui/Markdown";
import { Spinner } from "@/client/shared/ui/Spinner";
import type { AgentCard } from "@/common/orca/types";

interface SessionConversationProps {
  agent: AgentCard;
}

/** The session's turns as a chat, newest at the bottom, kept scrolled down as turns arrive. */
export function SessionConversation({ agent }: SessionConversationProps) {
  const sessionId = agent.session?.id ?? null;
  const conversation = useQuery({ ...conversationQueryOptions(sessionId ?? ""), enabled: sessionId !== null });
  const listRef = useRef<HTMLOListElement>(null);
  const turns = conversation.data ?? [];
  const last = turns.at(-1);
  const lastKey = last ? `${last.id}:${last.answer?.length ?? 0}` : "";
  const working = agent.state === "working";

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastKey, working]);

  if (!sessionId || (conversation.isSuccess && turns.length === 0)) {
    return (
      <p className="rounded-md bg-tint px-3 py-2 text-muted">
        {agent.lastMessage ? plainMessage(agent.lastMessage) : working ? "첫 답을 쓰는 중이에요…" : "아직 대화가 없어요."}
      </p>
    );
  }
  if (conversation.error) return <p className="text-[12px] text-accent">대화 기록을 읽지 못했어요: {conversation.error.message}</p>;
  if (conversation.isPending) return <p className="text-[12px] text-muted">대화 불러오는 중…</p>;

  return (
    <ol ref={listRef} aria-label="대화" className="flex max-h-[40vh] flex-col gap-3 overflow-y-auto pr-1">
      {turns.map((turn) => (
        <li key={turn.id} className="flex flex-col gap-1.5">
          <div className="flex items-end justify-end gap-2">
            {turn.at && <span className="text-[11px] text-faint tabular-nums">{formatClock(turn.at)}</span>}
            <p className="max-w-[75%] rounded-[12px] bg-fg px-3 py-2 leading-relaxed whitespace-pre-wrap text-bg">{turn.prompt}</p>
          </div>
          {turn.answer ? (
            <div className="max-w-[85%] rounded-[12px] bg-tint px-3 py-2">
              <Markdown text={turn.answer} />
            </div>
          ) : (
            turn !== last && <p className="text-[12px] text-muted">답 없이 끝났어요</p>
          )}
        </li>
      ))}
      {working && (
        <li className="flex items-center gap-1.5 text-[12px] text-now">
          <Spinner />
          에이전트가 작업 중이에요
        </li>
      )}
    </ol>
  );
}
