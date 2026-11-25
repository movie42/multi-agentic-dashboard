import { addDays, daysBetween, isCardDone, isOverdue, sprintStart } from "@/common/todos/sprint";
import type { TodoBoard, TodoCard } from "@/common/todos/types";

/** Day columns 0–6 of the week a bar covers; clipped ends mean the span keeps going past the week. */
export interface TimelineSpan {
  from: number;
  to: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

export type TimelineRow =
  | {
      kind: "card";
      card: TodoCard;
      depth: 0 | 1;
      /** A bar when the card has a start day, a single deadline mark otherwise. */
      mark: "bar" | "dot";
      /** Null for an overdue row, or a story card whose own dates fall outside the week. */
      span: TimelineSpan | null;
      overdueDays: number | null;
    }
  | { kind: "group"; key: string; summary: string };

interface Unit {
  head: TimelineRow;
  children: TimelineRow[];
  sortKey: string;
  title: string;
}

const firstDay = (card: TodoCard): string | null => card.startDate ?? card.dueDate;

export function spanIn(card: TodoCard, weekStart: string): TimelineSpan | null {
  const due = card.dueDate;
  const start = firstDay(card);
  if (due === null || start === null) return null;
  const weekEnd = addDays(weekStart, 6);
  if (start > weekEnd || due < weekStart) return null;
  return {
    from: Math.max(0, daysBetween(weekStart, start)),
    to: Math.min(6, daysBetween(weekStart, due)),
    clippedStart: start < weekStart,
    clippedEnd: due > weekEnd,
  };
}

function cardRow(card: TodoCard, depth: 0 | 1, span: TimelineSpan | null, overdueDays: number | null = null): TimelineRow {
  return { kind: "card", card, depth, mark: card.startDate === null ? "dot" : "bar", span, overdueDays };
}

const byStart = (a: TodoCard, b: TodoCard) => (firstDay(a) ?? "").localeCompare(firstDay(b) ?? "") || a.title.localeCompare(b.title);

/**
 * Rows for one sprint week. In this week, open cards whose deadline passed before it come first. Jira sub-issues sit
 * under their story's card, or under a header naming the story when no card carries it.
 */
export function weekRows(board: TodoBoard, cards: readonly TodoCard[], weekStart: string, today: string): TimelineRow[] {
  const shown = cards.filter((card) => card.archivedAt === null);
  const isThisWeek = weekStart === sprintStart(today, board.settings.weekStartsOn);
  const overdue = isThisWeek
    ? shown.filter((card) => isOverdue(board, card, today) && (card.dueDate ?? "") < weekStart).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    : [];
  const inWeek = shown.filter((card) => spanIn(card, weekStart) !== null).sort(byStart);
  const storyOf = (key: string) => shown.find((card) => card.jira.some((jira) => jira.key === key));

  const groups = new Map<string, TodoCard[]>();
  const loose: TodoCard[] = [];
  inWeek.forEach((card) => {
    const parent = card.jiraParent?.key;
    if (parent) groups.set(parent, [...(groups.get(parent) ?? []), card]);
    else loose.push(card);
  });

  const units: Unit[] = [];
  groups.forEach((children, key) => {
    const story = storyOf(key);
    const head: TimelineRow = story ? cardRow(story, 0, spanIn(story, weekStart)) : { kind: "group", key, summary: children[0]?.jiraParent?.summary ?? key };
    const first = children[0];
    units.push({ head, children: children.map((child) => cardRow(child, 1, spanIn(child, weekStart))), sortKey: (first && firstDay(first)) ?? "", title: story?.title ?? key });
  });
  const heads = new Set(units.flatMap((unit) => (unit.head.kind === "card" ? [unit.head.card.id] : [])));
  loose
    .filter((card) => !heads.has(card.id))
    .forEach((card) => units.push({ head: cardRow(card, 0, spanIn(card, weekStart)), children: [], sortKey: firstDay(card) ?? "", title: card.title }));
  units.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.title.localeCompare(b.title));

  // An overdue story heading this week's sub-issues shows once, as an overdue row with its sub-issues under it.
  const late = (card: TodoCard) => cardRow(card, 0, null, daysBetween(card.dueDate ?? today, today));
  const lateIds = new Set(overdue.map((card) => card.id));
  const lateUnits = units.filter((unit) => unit.head.kind === "card" && lateIds.has(unit.head.card.id));
  const onTime = units.filter((unit) => !lateUnits.includes(unit));
  return [
    ...overdue.flatMap((card) => {
      const unit = lateUnits.find((each) => each.head.kind === "card" && each.head.card.id === card.id);
      return [late(card), ...(unit?.children ?? [])];
    }),
    ...onTime.flatMap((unit) => [unit.head, ...unit.children]),
  ];
}

/** How many weeks back the schedule may go: to the earliest week a card starts or is due in, never before this week when none. */
export function earliestWeekOffset(cards: readonly TodoCard[], today: string, weekStartsOn: number): number {
  const thisStart = sprintStart(today, weekStartsOn);
  const days = cards.flatMap((card) => {
    const day = card.archivedAt === null ? firstDay(card) : null;
    return day ? [day] : [];
  });
  const earliest = days.sort()[0];
  if (!earliest || earliest >= thisStart) return 0;
  return Math.floor(daysBetween(thisStart, sprintStart(earliest, weekStartsOn)) / 7);
}

export function isRowDone(board: TodoBoard, row: TimelineRow): boolean {
  return row.kind === "card" && isCardDone(board, row.card);
}

export type DragMode = "move" | "start" | "end";

export interface DatePatch {
  startDate?: string | null;
  dueDate?: string | null;
}

/** The date change a bar drag of `delta` days makes; null when nothing changes. */
export function dragPatch(card: TodoCard, mode: DragMode, delta: number): DatePatch | null {
  const due = card.dueDate;
  if (due === null || delta === 0) return null;
  if (mode === "move") {
    const dueDate = addDays(due, delta);
    return card.startDate === null ? { dueDate } : { startDate: addDays(card.startDate, delta), dueDate };
  }
  if (mode === "end") {
    const dueDate = addDays(due, delta);
    const floor = card.startDate ?? dueDate;
    return { dueDate: dueDate < floor ? floor : dueDate };
  }
  const moved = addDays(card.startDate ?? due, delta);
  const startDate = moved > due ? due : moved;
  return startDate === (card.startDate ?? due) && card.startDate === null ? null : { startDate };
}

/** The date change from dropping a card on a day: that day becomes the deadline, and a span keeps its length. */
export function dropPatch(card: TodoCard, day: string): DatePatch {
  if (card.startDate === null) return { dueDate: day };
  if (card.dueDate === null) return card.startDate <= day ? { dueDate: day } : { startDate: null, dueDate: day };
  return { startDate: addDays(card.startDate, daysBetween(card.dueDate, day)), dueDate: day };
}
