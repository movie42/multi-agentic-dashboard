"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { AgentFailure, TodoAgentTurn } from "@/common/todos/agentTurn";
import { sendTodoAgentMessage, todoKeys } from "@/client/entities/todo";
import { errorMessage } from "@/client/shared/model/errorMessage";
import { Modal } from "./Modal";

interface TodoAgentDialogProps {
  sessionCount: number;
  onClose: () => void;
}

type ChatLine =
  | { id: number; role: "user" | "agent" | "note"; text: string }
  | {
      id: number;
      role: "changes";
      changes: string[];
      failures: AgentFailure[];
    };

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

export function TodoAgentDialog({ sessionCount, onClose }: TodoAgentDialogProps) {
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const nextLineId = useRef(0);
  const chatEnd = useRef<HTMLDivElement>(null);

  const say = (role: "user" | "agent" | "note", text: string) => setLines((current) => [...current, { id: nextLineId.current++, role, text }]);
  const showChanges = (changes: string[], failures: AgentFailure[]) =>
    setLines((current) => [...current, { id: nextLineId.current++, role: "changes", changes, failures }]);

  const receive = (turn: TodoAgentTurn) => {
    setConversationId(turn.conversationId);
    say("agent", turn.reply);
    if (turn.changes.length > 0 || turn.failures.length > 0) showChanges(turn.changes, turn.failures);
  };

  const turn = useMutation({
    mutationFn: sendTodoAgentMessage,
    onSuccess: receive,
    onError: (error) => say("note", `에이전트가 답하지 못했어요: ${errorMessage(error)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: todoKeys.all }),
  });

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, turn.isPending]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || turn.isPending) return;
    say("user", message);
    setInput("");
    turn.mutate({ conversationId, message });
  };

  return (
    <Modal label="할일 에이전트" onClose={onClose}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-[18px] font-bold">할일 에이전트</h2>
          <p className="mt-1 text-[12px] text-muted">열린 세션과 지난 세션을 찾아 읽고, 말한 대로 보드를 바로 바꿔요. 바꾼 내용은 대화에 남아요.</p>
        </div>
        <button type="button" aria-label="닫기" onClick={onClose} className="text-[18px] leading-none text-muted hover:text-fg">
          ×
        </button>
      </div>

      <div className="flex flex-col gap-2 text-[13px]">
        {lines.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {startersOf(sessionCount).map((starter) => (
              <button key={starter} type="button" onClick={() => send(starter)} className="rounded-full bg-tint px-3 py-1.5 text-muted hover:text-fg">
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
        {turn.isPending && <p className="self-start text-[12px] text-muted">에이전트가 세션을 찾아 읽는 중… (30초~1분)</p>}
        <div ref={chatEnd} />
      </div>

      <div className="sticky -bottom-6 -mx-6 -mb-6 flex items-end gap-2 bg-bg px-6 pt-3 pb-6">
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
        <button type="button" onClick={() => send(input)} disabled={turn.isPending || !input.trim()} className={`${BUTTON} bg-fg text-bg`}>
          보내기
        </button>
      </div>
    </Modal>
  );
}
