"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { AgentFailure } from "@/common/todos/agentTurn";
import { todoKeys } from "@/client/entities/todo";
import { appendDictation, DictationButton } from "@/client/shared/ui/DictationButton";
import { useTodoAgentStore } from "../model/todoAgentStore";

const BUTTON = "rounded-md px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40";

function startersOf(openSessionCount: number): string[] {
  const open = openSessionCount > 0 ? [`카드에 안 붙은 열린 세션 ${openSessionCount}개를 카드로 만들어 줘`] : [];
  return [...open, "지난 세션 중 끝나지 않은 일을 찾아서 할일로 만들어 줘"];
}

interface ChangesLineProps {
  changes: string[];
  failures: AgentFailure[];
}

function ChangesLine({ changes, failures }: ChangesLineProps) {
  return (
    <div className="flex max-w-[85%] flex-col gap-1 self-start rounded-[12px] px-3 py-2 text-[12px] shadow-[inset_0_0_0_1px_var(--hair)]">
      <span className="font-semibold text-muted">{`보드에 반영 ${changes.length}${failures.length > 0 ? ` · 실패 ${failures.length}` : ""}`}</span>
      <ul className="flex flex-col gap-0.5">
        {changes.map((change, index) => (
          <li key={`ok-${index}`}>{`✓ ${change}`}</li>
        ))}
        {failures.map((failure, index) => (
          <li key={`fail-${index}`} className="text-accent">{`✕ ${failure.summary} — ${failure.error}`}</li>
        ))}
      </ul>
    </div>
  );
}

export function TodoAgentChat() {
  const queryClient = useQueryClient();
  const { lines, pending, sessionCount, send: sendToStore, reset } = useTodoAgentStore();
  const [input, setInput] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void useTodoAgentStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, pending]);

  const send = (text: string) => {
    if (!text.trim() || pending) return;
    setInput("");
    sendToStore(text, { onSettled: () => void queryClient.invalidateQueries({ queryKey: todoKeys.all }) });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 px-5 pt-4">
        <p className="flex-1 text-[12px] text-muted">
          열린 세션과 지난 세션을 찾아 읽고, 말한 대로 보드를 바로 바꿔요. 다른 화면으로 가도 대화는 이어져요.
        </p>
        {lines.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={reset}
            className="shrink-0 text-[12px] text-muted underline decoration-faint underline-offset-[3px] hover:text-fg disabled:opacity-40"
          >
            새 대화
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-4 text-[13px]">
        {lines.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {startersOf(sessionCount).map((starter) => (
              <button key={starter} type="button" onClick={() => send(starter)} className="rounded-full bg-tint px-3 py-1.5 text-left text-muted hover:text-fg">
                {starter}
              </button>
            ))}
          </div>
        )}
        {lines.map((line) => {
          if (line.role === "changes") return <ChangesLine key={line.id} changes={line.changes} failures={line.failures} />;
          if (line.role === "user") {
            return (
              <p key={line.id} className="max-w-[85%] self-end rounded-[12px] bg-fg px-3 py-2 whitespace-pre-wrap text-bg">
                {line.text}
              </p>
            );
          }
          if (line.role === "agent") {
            return (
              <p key={line.id} className="max-w-[85%] self-start rounded-[12px] bg-tint px-3 py-2 whitespace-pre-wrap">
                {line.text}
              </p>
            );
          }
          return (
            <p key={line.id} className="self-center text-[12px] text-muted">
              {line.text}
            </p>
          );
        })}
        {pending && <p className="self-start text-[12px] text-muted">에이전트가 세션을 찾아 읽는 중… (30초~1분)</p>}
        <div ref={chatEnd} />
      </div>

      <div className="flex items-end gap-2 border-t border-hair px-5 pt-3 pb-4">
        <textarea
          aria-label="에이전트에게 말하기"
          rows={2}
          value={input}
          placeholder="예: 예전 세션 중 선물하기 관련된 것 모아서 남은 할일 만들어 줘"
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send(input);
            }
          }}
          className="flex-1 resize-none rounded-[10px] bg-tint px-3 py-2 text-[13px] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
        />
        <DictationButton onText={(text) => setInput(appendDictation(input, text))} className="mb-1" />
        <button type="button" onClick={() => send(input)} disabled={pending || !input.trim()} className={`${BUTTON} bg-fg text-bg`}>
          보내기
        </button>
      </div>
    </div>
  );
}
