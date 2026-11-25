"use client";

import type { TodoCard as TodoCardData } from "@/common/todos/types";
import { DUE_CHIP, type DueTone } from "../model/due";
import { CARD_DRAG_TYPE } from "../model/kinds";

interface TodoChipProps {
  card: TodoCardData;
  due: { text: string; tone: DueTone } | null;
  onOpen: (cardId: string) => void;
}

/** One-line card for the pinned trays above the calendar; drags onto a day like a full card. */
export function TodoChip({ card, due, onOpen }: TodoChipProps) {
  const key = card.jira[0]?.key;
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-todo-chip={card.id}
      aria-label={card.title}
      title={card.title}
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
      className="flex max-w-72 shrink-0 cursor-grab items-center gap-1.5 rounded-full bg-bg py-1 pr-3 pl-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--hair)] outline-none hover:shadow-[inset_0_0_0_1.5px_var(--faint)] focus-visible:shadow-[inset_0_0_0_2px_var(--focus)] active:cursor-grabbing"
    >
      {key && <span className="shrink-0 font-mono text-[11px] font-semibold">{key}</span>}
      <span className="truncate">{key ? card.title.replace(key, "").replace(/^[\s:·-]+/, "") || card.title : card.title}</span>
      {due && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${DUE_CHIP[due.tone]}`}>{due.text}</span>}
    </div>
  );
}
