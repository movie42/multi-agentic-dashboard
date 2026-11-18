"use client";

import { useState } from "react";
import { archivedCards } from "@/common/todos/board";
import type { TodoBoard, TodoCard } from "@/common/todos/types";
import { Modal } from "@/client/shared/ui/Modal";
import type { RunTodoOp } from "../model/run";

interface TodoArchiveProps {
  board: TodoBoard;
  onOpen: (cardId: string) => void;
  onRun: RunTodoOp;
  onClose: () => void;
}

function haystack(card: TodoCard): string {
  return [card.title, card.memo, card.repo, card.worktreePath, ...card.jira.map((jira) => jira.key), ...card.links.map((link) => link.url)]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function TodoArchive({ board, onOpen, onRun, onClose }: TodoArchiveProps) {
  const [query, setQuery] = useState("");
  const all = archivedCards(board);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const cards = terms.length === 0 ? all : all.filter((card) => terms.every((term) => haystack(card).includes(term)));

  return (
    <Modal label="아카이브" onClose={onClose}>
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-[22px] leading-[1.3] font-bold tracking-[-0.015em]">아카이브</h2>
        <button type="button" aria-label="닫기" onClick={onClose} className="text-[18px] leading-none text-muted hover:text-fg">
          ×
        </button>
      </div>
      <p className="-mt-3 text-[13px] text-muted">끝 상태로 옮긴 지 하루가 지난 카드가 여기로 와요. 지우지 않고 남겨 둬요.</p>
      <input
        autoFocus
        aria-label="아카이브 검색"
        value={query}
        placeholder="제목 · 메모 · 지라 키 · 프로젝트로 찾기"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
        className="rounded-full bg-tint px-3.5 py-2 text-[13px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
      />
      {cards.length === 0 ? (
        <p className="text-[13px] text-muted">{all.length === 0 ? "아직 아카이브된 카드가 없어요." : "찾는 카드가 없어요."}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hair">
          {cards.map((card) => (
            <li key={card.id} className="flex items-center gap-3 py-2.5 text-[13px]">
              <span className="w-16 shrink-0 text-[11px] text-muted">
                {card.archivedAt ? new Date(card.archivedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : ""}
              </span>
              <button type="button" onClick={() => onOpen(card.id)} className="min-w-0 flex-1 truncate text-left font-semibold hover:underline">
                {card.title}
              </button>
              {card.jira.map((jira) => (
                <span key={jira.key} className="shrink-0 font-mono text-[11px] text-muted">
                  {jira.key}
                </span>
              ))}
              {card.repo && <span className="shrink-0 text-[11px] text-muted">{card.repo}</span>}
              <button
                type="button"
                onClick={() => void onRun({ type: "card-restore", cardId: card.id })}
                className="shrink-0 text-muted underline decoration-faint underline-offset-[3px] hover:text-fg"
              >
                되돌리기
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
