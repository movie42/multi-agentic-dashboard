import { daysBetween, weekdayOf } from "@/common/todos/sprint";

export type DueTone = "overdue" | "today" | "soon" | "later" | "done";

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayName(day: string): string {
  return WEEKDAYS[weekdayOf(day)] ?? "";
}

export function dayLabel(day: string): string {
  const [, month, date] = day.split("-").map(Number);
  return `${month}/${date}(${weekdayName(day)})`;
}

export function dueCaption(dueDate: string, today: string, done: boolean): { text: string; tone: DueTone } {
  const label = dayLabel(dueDate);
  if (done) return { text: label, tone: "done" };
  const left = daysBetween(today, dueDate);
  if (left < 0) return { text: `${label} · ${-left}일 지남`, tone: "overdue" };
  if (left === 0) return { text: `${label} · 오늘`, tone: "today" };
  if (left === 1) return { text: `${label} · 내일`, tone: "soon" };
  return { text: `${label} · ${left}일 남음`, tone: "later" };
}

export const DUE_CHIP: Record<DueTone, string> = {
  overdue: "text-accent shadow-[inset_0_0_0_1.5px_var(--accent)]",
  today: "text-now shadow-[inset_0_0_0_1.5px_var(--st-now)]",
  soon: "text-fg shadow-[inset_0_0_0_1px_var(--hair)]",
  later: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
  done: "text-muted",
};
