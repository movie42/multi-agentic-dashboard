"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { statusOf } from "@/common/todos/board";
import { addDays, carryOverCards, isCardDone, sprintDays, sprintStart, weekdayOf } from "@/common/todos/sprint";
import type { TodoBoard, TodoCard } from "@/common/todos/types";
import { dayLabel, weekdayName } from "../model/due";
import { CARD_DRAG_TYPE, type StatusTone, statusTone } from "../model/kinds";
import { barLines, ROW_HEIGHT, TITLE_WIDTH, titleLines } from "../model/lineSize";
import { LineResizer, useStoredSize } from "./LineResizer";
import { type DatePatch, type DragMode, dragPatch, dropPatch, earliestWeekOffset, spanIn, type TimelineRow, weekRows } from "../model/timeline";

interface TodoScheduleProps {
  board: TodoBoard;
  today: string;
  visible: (card: TodoCard) => boolean;
  renderChip: (card: TodoCard) => React.ReactNode;
  onOpen: (cardId: string) => void;
  onPatch: (cardId: string, patch: DatePatch) => void;
  onCarryOver: (cardIds: string[]) => void;
}

interface Drag {
  cardId: string;
  mode: DragMode;
  originX: number;
  dayWidth: number;
  delta: number;
}

/**
 * Title column, then the sprint's seven days. Shared by the day header and every row so the columns line up. The
 * title width, row height and visible line counts come from CSS variables the person sets by dragging.
 */
const GRID = "grid grid-cols-[var(--todo-title-w,240px)_minmax(0,1fr)] gap-x-3";
const ROW_H = "h-[var(--todo-row-h,36px)]";
const BAR_H = "h-[calc(var(--todo-row-h,36px)-8px)] py-0.5 text-[11px] leading-[14px]";
const TITLE_CLAMP = "line-clamp-[var(--todo-title-lines,1)] break-words";
const BAR_CLAMP = "line-clamp-[var(--todo-bar-lines,1)] break-words";
const COL_START = ["col-start-1", "col-start-2", "col-start-3", "col-start-4", "col-start-5", "col-start-6", "col-start-7"];
const COL_END = ["col-end-2", "col-end-3", "col-end-4", "col-end-5", "col-end-6", "col-end-7", "col-end-8"];
/** A pointer that moves less than this is a click that opens the card, not a drag. */
const CLICK_SLOP_PX = 4;

function weekName(offset: number): string | null {
  if (offset === 0) return "이번 주";
  if (offset === 1) return "다음 주";
  if (offset === -1) return "지난 주";
  return null;
}

function cardDragStart(cardId: string) {
  return (event: React.DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(CARD_DRAG_TYPE, cardId);
    event.dataTransfer.effectAllowed = "move";
  };
}

/** The day column under the pointer: the cell itself, or by x position when a bar sits on top of the cell. */
function dayOfTarget(event: React.DragEvent<HTMLElement>, days: readonly string[], dayRow: HTMLElement | null): string | null {
  const cell = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-day]")?.dataset.day : undefined;
  if (cell) return cell;
  const rect = dayRow?.getBoundingClientRect();
  if (!rect || rect.width === 0) return null;
  return days[Math.floor(((event.clientX - rect.left) / rect.width) * 7)] ?? null;
}

function shortTitle(card: TodoCard, key: string | undefined): string {
  if (!key) return card.title;
  return card.title.replace(key, "").replace(/^[\s:·-]+/, "") || card.title;
}

/** Fill, text and the deadline cap on the right end, by where the status sits in the workflow. */
const BAR_TONE: Record<StatusTone, string> = {
  first: "bg-tint-2 text-muted shadow-[inset_0_0_0_1px_var(--hair),inset_-3px_0_0_var(--faint)]",
  middle: "bg-now/15 text-now shadow-[inset_-3px_0_0_var(--st-now)]",
  last: "bg-done/20 text-muted line-through decoration-faint shadow-[inset_-3px_0_0_var(--st-done)]",
};

interface RowTitleProps {
  board: TodoBoard;
  row: Extract<TimelineRow, { kind: "card" }>;
  onOpen: (cardId: string) => void;
}

function RowTitle({ board, row, onOpen }: RowTitleProps) {
  const { card, depth } = row;
  const key = card.jira[0]?.key;
  const done = isCardDone(board, card);
  return (
    <button
      type="button"
      draggable
      data-todo-row={card.id}
      aria-label={card.title}
      title={card.title}
      onDragStart={cardDragStart(card.id)}
      onClick={() => onOpen(card.id)}
      className={`flex min-w-0 cursor-grab items-center gap-1.5 overflow-hidden rounded-[6px] py-1 text-left text-[13px] leading-[18px] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)] active:cursor-grabbing ${depth === 1 ? "pl-5" : "pl-1"} ${done ? "text-muted" : ""}`}
    >
      {depth === 1 && <span className="shrink-0 self-start text-faint">└</span>}
      <span className={`min-w-0 ${TITLE_CLAMP}`}>
        {key && <span className="mr-1.5 font-mono text-[11px] font-semibold text-muted">{key}</span>}
        <span className={done ? "line-through decoration-faint" : ""}>{shortTitle(card, key)}</span>
      </span>
    </button>
  );
}

interface BarProps {
  board: TodoBoard;
  card: TodoCard;
  weekStart: string;
  drag: Drag | null;
  onGrab: (event: React.PointerEvent<HTMLElement>, card: TodoCard, mode: DragMode) => void;
}

const HANDLE = "absolute inset-y-0 z-10 w-2 cursor-ew-resize touch-none";

/**
 * A pill from start to deadline, or one day wide when there is no start day, labelled with the card's status. The
 * solid cap on the right end is the deadline. Dragging the body moves the whole span; the left edge sets the start
 * day (pulling it out of a one-day pill creates one) and the right edge the deadline.
 */
function Bar({ board, card, weekStart, drag, onGrab }: BarProps) {
  const preview = drag && drag.cardId === card.id ? { ...card, ...dragPatch(card, drag.mode, drag.delta) } : card;
  const span = spanIn(preview, weekStart);
  if (!span) return null;
  const placement = `${COL_START[span.from] ?? ""} ${COL_END[span.to] ?? ""} row-start-1`;
  const status = statusOf(board, card.statusId)?.name ?? "";
  const label = card.startDate === null ? `${card.title} 마감일 옮기기` : `${card.title} 기간 옮기기`;
  return (
    <div className={`${placement} relative flex items-center px-0.5`}>
      <span
        aria-label={label}
        title={card.startDate === null ? `${status} · 마감 ${dayLabel(card.dueDate ?? "")}` : `${status} · ${dayLabel(card.startDate)} – ${dayLabel(card.dueDate ?? "")}`}
        onPointerDown={(event: React.PointerEvent<HTMLElement>) => onGrab(event, card, "move")}
        className={`relative flex w-full min-w-0 cursor-grab touch-none items-center overflow-hidden px-2 font-semibold active:cursor-grabbing ${BAR_H} ${BAR_TONE[statusTone(board, card.statusId)]} ${span.clippedStart ? "rounded-l-none" : "rounded-l-[6px]"} ${span.clippedEnd ? "rounded-r-none" : "rounded-r-[6px]"} ${drag?.cardId === card.id ? "ring-2 ring-focus" : ""}`}
      >
        <span className={`min-w-0 ${BAR_CLAMP}`}>{status}</span>
        {!span.clippedStart && (
          <span
            aria-label={card.startDate === null ? `${card.title} 시작일 만들기` : `${card.title} 시작일 바꾸기`}
            title={card.startDate === null ? "왼쪽으로 끌어 시작일을 정해요" : undefined}
            onPointerDown={(event: React.PointerEvent<HTMLElement>) => onGrab(event, card, "start")}
            className={`${HANDLE} left-0`}
          />
        )}
        {!span.clippedEnd && (
          <span aria-label={`${card.title} 마감일 바꾸기`} onPointerDown={(event: React.PointerEvent<HTMLElement>) => onGrab(event, card, "end")} className={`${HANDLE} right-0`} />
        )}
      </span>
    </div>
  );
}

function OverdueBar({ board, card, days }: { board: TodoBoard; card: TodoCard; days: number }) {
  return (
    <div className="col-span-2 col-start-1 row-start-1 flex items-center px-0.5">
      <span className={`flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-r-[6px] bg-accent/12 px-2 font-semibold text-accent shadow-[inset_-3px_0_0_var(--accent)] ${BAR_H}`}>
        <span className={`min-w-0 ${BAR_CLAMP}`}>{`← ${days}일 지남 · ${statusOf(board, card.statusId)?.name ?? ""}`}</span>
      </span>
    </div>
  );
}

function DayCells({ days, today, overDay }: { days: readonly string[]; today: string; overDay: string | null }) {
  return days.map((day, index) => {
    const weekend = weekdayOf(day) === 0 || weekdayOf(day) === 6;
    return (
      <div
        key={day}
        data-day={day}
        className={`${COL_START[index] ?? ""} row-start-1 self-stretch border-l border-hair ${day === overDay ? "bg-tint-2" : day === today ? "bg-now/8" : weekend ? "bg-tint/60" : ""}`}
      />
    );
  });
}

/** One sprint week as a timeline: a row per card, a bar from start to deadline or a mark on the deadline alone. */
export function TodoSchedule({ board, today, visible, renderChip, onOpen, onPatch, onCarryOver }: TodoScheduleProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const titleWidth = useStoredSize("agent-control:todo-title-w", TITLE_WIDTH);
  const rowHeight = useStoredSize("agent-control:todo-row-h", ROW_HEIGHT);
  const rootRef = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [overBacklog, setOverBacklog] = useState(false);
  const daysRef = useRef<HTMLOListElement>(null);

  const weekStartsOn = board.settings.weekStartsOn;
  const shown = board.cards.filter((card) => card.archivedAt === null && visible(card));
  const minOffset = earliestWeekOffset(shown, today, weekStartsOn);
  const offset = Math.max(weekOffset, minOffset);
  const weekStart = addDays(sprintStart(today, weekStartsOn), offset * 7);
  const days = sprintDays(weekStart);
  const weekEnd = days[6] ?? weekStart;
  const rows = weekRows(board, shown, weekStart, today);
  const weekCards = shown.filter((card) => card.dueDate !== null && card.dueDate >= weekStart && card.dueDate <= weekEnd);
  const doneCount = weekCards.filter((card) => isCardDone(board, card)).length;
  const backlog = shown.filter((card) => card.dueDate === null && !isCardDone(board, card));
  const carryIds = offset === 0 ? carryOverCards(board, today).filter(visible).map((card) => card.id) : [];
  const name = weekName(offset);
  const cardOf = (cardId: string) => board.cards.find((card) => card.id === cardId);

  useEffect(() => {
    const root = rootRef.current?.style;
    if (!root) return;
    root.setProperty("--todo-title-w", `${titleWidth.value}px`);
    root.setProperty("--todo-row-h", `${rowHeight.value}px`);
    root.setProperty("--todo-title-lines", String(titleLines(rowHeight.value)));
    root.setProperty("--todo-bar-lines", String(barLines(rowHeight.value)));
  }, [titleWidth.value, rowHeight.value]);

  const grab = (event: React.PointerEvent<HTMLElement>, card: TodoCard, mode: DragMode) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const width = daysRef.current?.getBoundingClientRect().width ?? 0;
    setDrag({ cardId: card.id, mode, originX: event.clientX, dayWidth: width > 0 ? width / 7 : 1, delta: 0 });
  };
  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const delta = Math.round((event.clientX - drag.originX) / drag.dayWidth);
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };
  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag) return;
    setDrag(null);
    const card = cardOf(drag.cardId);
    if (!card) return;
    if (drag.delta === 0) {
      if (Math.abs(event.clientX - drag.originX) < CLICK_SLOP_PX) onOpen(card.id);
      return;
    }
    const patch = dragPatch(card, drag.mode, drag.delta);
    if (patch) onPatch(card.id, patch);
  };

  const dayDrop = {
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      const day = dayOfTarget(event, days, daysRef.current);
      if (!day || !event.dataTransfer.types.includes(CARD_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setOverDay(day);
    },
    onDragLeave: () => setOverDay(null),
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      setOverDay(null);
      const day = dayOfTarget(event, days, daysRef.current);
      const card = cardOf(event.dataTransfer.getData(CARD_DRAG_TYPE));
      if (!day || !card) return;
      event.preventDefault();
      if (card.dueDate !== day) onPatch(card.id, dropPatch(card, day));
    },
  };

  return (
    <section ref={rootRef} aria-label="일정" className="flex flex-col pb-24" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
      <div className="sticky top-[var(--todo-pinned-h,0px)] z-10 flex flex-col gap-2 bg-bg pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="이전 주"
            disabled={offset <= minOffset}
            onClick={() => setWeekOffset(offset - 1)}
            className="rounded-full px-2.5 py-1 text-[15px] leading-none text-muted hover:bg-tint hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ‹
          </button>
          <h2 className="flex items-baseline gap-2">
            {name && <span className={`text-[14px] font-bold ${offset === 0 ? "text-now" : ""}`}>{name}</span>}
            <span className="text-[14px] font-semibold">{`${dayLabel(weekStart)} – ${dayLabel(weekEnd)}`}</span>
            <span className="text-[12px] text-muted">{weekCards.length === 0 ? "마감 카드 없음" : `끝 ${doneCount}/${weekCards.length}`}</span>
          </h2>
          <button type="button" aria-label="다음 주" onClick={() => setWeekOffset(offset + 1)} className="rounded-full px-2.5 py-1 text-[15px] leading-none text-muted hover:bg-tint hover:text-fg">
            ›
          </button>
          {offset !== 0 && (
            <button type="button" onClick={() => setWeekOffset(0)} className="rounded-full bg-tint px-3 py-1 text-[12px] font-semibold text-muted hover:text-fg">
              이번 주로
            </button>
          )}
          <span className="ml-auto" />
          {carryIds.length > 0 && (
            <button
              type="button"
              onClick={() => onCarryOver(carryIds)}
              className="rounded-full bg-bg px-3 py-1 text-[12px] font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:shadow-[inset_0_0_0_1.5px_var(--faint)]"
            >
              {`지난 주 남은 ${carryIds.length}개 이번 주로 넘기기`}
            </button>
          )}
        </div>

        <section
          aria-label="백로그"
          onDragOver={(event: React.DragEvent<HTMLElement>) => {
            if (!event.dataTransfer.types.includes(CARD_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setOverBacklog(true);
          }}
          onDragLeave={() => setOverBacklog(false)}
          onDrop={(event: React.DragEvent<HTMLElement>) => {
            setOverBacklog(false);
            const card = cardOf(event.dataTransfer.getData(CARD_DRAG_TYPE));
            if (!card || card.dueDate === null) return;
            event.preventDefault();
            onPatch(card.id, { startDate: null, dueDate: null });
          }}
          className={`flex min-w-0 items-center gap-3 rounded-[12px] px-3 py-2 ${overBacklog ? "bg-tint-2 shadow-[inset_0_0_0_1.5px_var(--faint)]" : "bg-tint"}`}
        >
          <h3 className="shrink-0 text-[13px] font-bold">
            백로그 <span className="font-semibold text-muted">{backlog.length}</span>
          </h3>
          {backlog.length === 0 ? (
            <p className="text-[12px] text-muted">줄을 여기로 끌어 놓으면 날짜를 지워요.</p>
          ) : (
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5">
              {backlog.map((card) => (
                <Fragment key={card.id}>{renderChip(card)}</Fragment>
              ))}
            </div>
          )}
        </section>

        <div className={`${GRID} border-b border-hair`}>
          <div className="relative flex min-w-0 items-end">
            <span className="truncate pb-1 pl-1 text-[11px] text-muted" title="요일 칸으로 끌어 마감일을 정해요 · 오른쪽 끝을 끌어 제목 칸 너비, 줄 아래 끝을 끌어 줄 높이를 바꿔요">
              요일 칸으로 끌어 마감일을 정해요
            </span>
            <LineResizer axis="x" label="제목 칸 너비 조절" size={titleWidth} className="inset-y-0 -right-2.5" />
          </div>
          <ol ref={daysRef} className="grid grid-cols-7" {...dayDrop}>
            {days.map((day) => {
              const isToday = day === today;
              return (
                <li
                  key={day}
                  data-day={day}
                  aria-label={dayLabel(day)}
                  className={`flex flex-col items-center rounded-t-[8px] py-1 text-[12px] font-semibold ${day === overDay ? "bg-tint-2" : isToday ? "bg-now/8 text-now" : day < today ? "text-faint" : "text-muted"}`}
                >
                  <span>{weekdayName(day)}</span>
                  <span className="text-[13px]">{Number(day.slice(8))}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-muted">이 주에 걸친 카드가 없어요. 백로그 카드를 요일 칸으로 끌어 놓아 보세요.</p>
      ) : (
        <ul aria-label="이 주 카드" className="flex flex-col" {...dayDrop}>
          {rows.map((row) => (
            <li key={row.kind === "group" ? `group-${row.key}` : `${row.card.id}-${row.depth}`} className={`${GRID} ${ROW_H} relative items-stretch border-b border-hair hover:bg-tint`}>
              {row.kind === "group" ? (
                <span className="flex min-w-0 items-center gap-1.5 overflow-hidden py-1 pl-1 text-[13px] leading-[18px] font-semibold text-muted" title={row.summary}>
                  <span className="size-1.5 shrink-0 rounded-full bg-faint" />
                  <span className={`min-w-0 ${TITLE_CLAMP}`}>
                    <span className="mr-1.5 font-mono text-[11px]">{row.key}</span>
                    {row.summary}
                  </span>
                </span>
              ) : (
                <RowTitle board={board} row={row} onOpen={onOpen} />
              )}
              <div className="grid grid-cols-7 items-center">
                <DayCells days={days} today={today} overDay={overDay} />
                {row.kind === "card" && row.overdueDays !== null && (
                  <OverdueBar board={board} card={row.card} days={row.overdueDays} />
                )}
                {row.kind === "card" && row.overdueDays === null && (
                  <Bar board={board} card={row.card} weekStart={weekStart} drag={drag} onGrab={grab} />
                )}
              </div>
              <LineResizer axis="y" label="줄 높이 조절" size={rowHeight} className="inset-x-0 -bottom-1" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
