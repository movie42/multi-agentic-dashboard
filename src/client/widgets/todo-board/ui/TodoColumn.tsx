"use client";

import { useState } from "react";
import { cardsOfColumn, firstStatusOfColumn, statusOf } from "@/common/todos/board";
import type { TodoBoard, TodoCard as TodoCardData, TodoColumn as TodoColumnData } from "@/common/todos/types";
import { CARD_DRAG_TYPE } from "../model/kinds";
import type { SessionLookup } from "../model/sessions";
import { ColumnMenu, type ColumnMenuActions } from "./ColumnMenu";
import { TodoCard } from "./TodoCard";

interface TodoColumnProps {
  board: TodoBoard;
  column: TodoColumnData;
  visible: (card: TodoCardData) => boolean;
  now: number;
  sessionOf: SessionLookup;
  onOpen: (cardId: string) => void;
  onDropCard: (cardId: string, column: TodoColumnData) => void;
  onAddCard: (title: string, column: TodoColumnData) => void;
  menu: ColumnMenuActions;
}

export function TodoColumn({ board, column, visible, now, sessionOf, onOpen, onDropCard, onAddCard, menu }: TodoColumnProps) {
  const [over, setOver] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const cards = cardsOfColumn(board, column).filter(visible);
  const shown = cards.filter((card) => !card.hidden);
  const hidden = cards.filter((card) => card.hidden);
  const droppable = firstStatusOfColumn(board, column) !== undefined;

  const submit = () => {
    const title = (draft ?? "").trim();
    if (title) onAddCard(title, column);
    setDraft(null);
  };

  return (
    <section
      aria-label={column.name}
      data-todo-column={column.id}
      onDragOver={(event: React.DragEvent<HTMLElement>) => {
        if (!droppable || !event.dataTransfer.types.includes(CARD_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event: React.DragEvent<HTMLElement>) => {
        setOver(false);
        const cardId = event.dataTransfer.getData(CARD_DRAG_TYPE);
        if (!cardId) return;
        event.preventDefault();
        onDropCard(cardId, column);
      }}
      className={`flex w-72 shrink-0 flex-col gap-2 rounded-[12px] p-2 ${over ? "bg-tint-2 shadow-[inset_0_0_0_1.5px_var(--faint)]" : "bg-tint"}`}
    >
      <header className="flex items-center gap-2 px-1 pt-1">
        <h2 className="truncate text-[13px] font-bold">{column.name}</h2>
        <span className="text-[12px] font-semibold text-muted">{shown.length}</span>
        <span className="relative ml-auto">
          <ColumnMenu board={board} column={column} actions={menu} />
        </span>
      </header>
      {!droppable && <p className="px-1 text-[12px] text-muted">담은 상태가 없어요. ⋯에서 상태를 고르세요.</p>}
      {shown.map((card) => (
        <TodoCard key={card.id} card={card} status={statusOf(board, card.statusId)} now={now} sessionOf={sessionOf} onOpen={onOpen} />
      ))}
      {hidden.length > 0 && (
        <button
          type="button"
          onClick={() => setShowHidden((current) => !current)}
          className="self-start px-1 text-[12px] text-muted underline decoration-faint underline-offset-[3px] hover:text-fg"
        >
          {showHidden ? "숨긴 카드 접기" : `숨긴 카드 보기 ${hidden.length}`}
        </button>
      )}
      {showHidden &&
        hidden.map((card) => (
          <TodoCard key={card.id} card={card} status={statusOf(board, card.statusId)} now={now} sessionOf={sessionOf} onOpen={onOpen} />
        ))}
      {droppable &&
        (draft === null ? (
          <button type="button" onClick={() => setDraft("")} className="self-start px-1 py-1 text-[13px] text-muted hover:text-fg">
            + 카드
          </button>
        ) : (
          <input
            autoFocus
            value={draft}
            aria-label="새 카드 제목"
            placeholder="할 일 제목"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
            onBlur={submit}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
              if (event.key === "Escape") setDraft(null);
            }}
            className="rounded-[10px] bg-bg px-3 py-2 text-[14px] shadow-[inset_0_0_0_1.5px_var(--faint)] outline-none"
          />
        ))}
    </section>
  );
}
