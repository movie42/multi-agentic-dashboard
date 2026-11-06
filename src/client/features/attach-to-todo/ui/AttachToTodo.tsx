"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TODO_TITLE_LIMIT } from "@/common/todos/schema";
import { todoBoardQueryOptions, useTodoOp } from "@/client/entities/todo";

export interface AttachTarget {
  sessionId: string;
  title: string;
  repo: string | null;
  worktreePath: string | null;
}

interface AttachToTodoProps {
  target: AttachTarget;
}

const IDLE_STALE_MS = 30_000;

export function AttachToTodo({ target }: AttachToTodoProps) {
  const boardQuery = useQuery({ ...todoBoardQueryOptions(), refetchInterval: false, staleTime: IDLE_STALE_MS });
  const { run, pending } = useTodoOp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const cards = boardQuery.data?.cards ?? [];
  const attached = cards.find((card) => card.sessionIds.includes(target.sessionId)) ?? null;
  const needle = query.trim().toLowerCase();
  const matches = cards.filter((card) => card.id !== attached?.id && (!needle || card.title.toLowerCase().includes(needle)));

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const attach = async (cardId: string) => {
    if ((await run({ type: "session-attach", cardId, sessionId: target.sessionId })) !== null) close();
  };

  const createCard = async () => {
    const title = (query.trim() || target.title).replace(/\s+/g, " ").slice(0, TODO_TITLE_LIMIT) || "새 카드";
    const created = await run({
      type: "card-create",
      title,
      repo: target.repo,
      worktreePath: target.worktreePath,
      sessionIds: [target.sessionId],
    });
    if (created !== null) close();
  };

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        title={attached ? `할일 카드: ${attached.title}` : "할일에 붙이기"}
        onClick={() => setOpen((current) => !current)}
        className={`max-w-40 truncate rounded-full px-2 py-1 text-[11px] leading-none font-semibold ${
          attached ? "bg-tint-2 text-fg" : "text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg"
        }`}
      >
        {attached ? `할일 · ${attached.title}` : "할일에 붙이기"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={close} />
          <div
            role="dialog"
            aria-label="할일에 붙이기"
            className="absolute top-full right-0 z-50 mt-1 flex w-72 flex-col gap-2 rounded-[12px] bg-bg p-3 text-[13px] shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]"
          >
            {attached && <p className="text-[12px] text-muted">지금 ‘{attached.title}’ 카드에 붙어 있어요. 다른 카드를 고르면 옮겨 붙어요.</p>}
            <input
              autoFocus
              type="search"
              aria-label="카드 찾기"
              value={query}
              placeholder="카드 찾기 · 새 카드 제목"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Escape") close();
              }}
              className="rounded-md bg-tint px-2.5 py-1.5 outline-none focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
            />
            <ul className="flex max-h-56 flex-col overflow-y-auto">
              {matches.slice(0, 30).map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void attach(card.id)}
                    className="w-full truncate rounded-md px-2 py-1.5 text-left hover:bg-tint disabled:opacity-40"
                  >
                    {card.title}
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="px-2 py-1.5 text-muted">{boardQuery.isLoading ? "카드를 읽는 중…" : "고를 카드가 없어요"}</li>}
            </ul>
            <button
              type="button"
              disabled={pending}
              onClick={() => void createCard()}
              className="rounded-md bg-fg px-3 py-1.5 text-left font-semibold text-bg disabled:opacity-40"
            >
              새 카드로 만들기{query.trim() ? ` · ${query.trim()}` : ""}
            </button>
          </div>
        </>
      )}
    </span>
  );
}
