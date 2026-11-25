import type { TodoBoard, TodoCard } from "./types";

/** Which cards the kanban shows: this week's sprint, next week's, cards with no deadline, or all. */
export type SprintScope = "this" | "next" | "backlog" | "all";

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// Day strings are computed in UTC so that adding days never trips over a daylight-saving shift.
function utcOf(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function format(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day written "YYYY-MM-DD"; "2026-02-31" has the shape but rolls over, so it is refused. */
export function isTodoDay(value: string): boolean {
  return DAY_SHAPE.test(value) && format(utcOf(value)) === value;
}

export function dayOf(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(day: string, days: number): string {
  return format(new Date(utcOf(day).getTime() + days * DAY_MS));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to).getTime() - utcOf(from).getTime()) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: string): number {
  return utcOf(day).getUTCDay();
}

export function sprintStart(day: string, weekStartsOn: number): string {
  return addDays(day, -((weekdayOf(day) - weekStartsOn + 7) % 7));
}

export function sprintDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function isCardDone(board: TodoBoard, card: TodoCard): boolean {
  return card.archivedAt !== null || card.statusId === board.statuses.at(-1)?.id;
}

export function isOverdue(board: TodoBoard, card: TodoCard, today: string): boolean {
  return card.dueDate !== null && card.dueDate < today && !isCardDone(board, card);
}

function within(day: string, start: string): boolean {
  return day >= start && day <= addDays(start, 6);
}

export function inScope(board: TodoBoard, card: TodoCard, scope: SprintScope, today: string, weekStartsOn: number): boolean {
  const start = sprintStart(today, weekStartsOn);
  switch (scope) {
    case "all":
      return true;
    case "backlog":
      return card.dueDate === null;
    case "next":
      return card.dueDate !== null && within(card.dueDate, addDays(start, 7));
    case "this":
      return card.dueDate !== null && (within(card.dueDate, start) || isOverdue(board, card, today));
  }
}

/** The same weekday inside this sprint, or today when that day has already passed. */
export function carryOverDay(dueDate: string, today: string, weekStartsOn: number): string {
  const start = sprintStart(today, weekStartsOn);
  const weeks = Math.ceil(daysBetween(dueDate, start) / 7);
  const moved = addDays(dueDate, Math.max(weeks, 0) * 7);
  return moved < today ? today : moved;
}

/** A card added while a sprint is picked gets that sprint's last day, so it does not vanish from the filtered board. */
export function newCardDueDate(scope: SprintScope, today: string, weekStartsOn: number): string | null {
  const end = addDays(sprintStart(today, weekStartsOn), 6);
  if (scope === "this") return end;
  if (scope === "next") return addDays(end, 7);
  return null;
}

/** Open cards whose deadline fell in an earlier sprint. */
export function carryOverCards(board: TodoBoard, today: string): TodoCard[] {
  const start = sprintStart(today, board.settings.weekStartsOn);
  return board.cards.filter((card) => card.dueDate !== null && card.dueDate < start && !isCardDone(board, card));
}
