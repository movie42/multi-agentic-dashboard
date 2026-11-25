import { describe, expect, it } from "vitest";
import { defaultBoard } from "@/common/todos/board";
import { applyTodoOp, type TodoOp } from "@/common/todos/ops";
import type { TodoBoard, TodoCard } from "@/common/todos/types";
import { dragPatch, dropPatch, earliestWeekOffset, weekRows, type TimelineRow } from "./timeline";

// 2026-11-25 is a Wednesday; with weeks starting Monday this sprint is 11/23–11/29.
const TODAY = "2026-11-25";
const THIS_WEEK = "2026-11-23";

type CardInput = Extract<TodoOp, { type: "card-create" }> & { jira?: string; parent?: string; archived?: boolean };

function boardOf(...inputs: Omit<CardInput, "type">[]): TodoBoard {
  let n = 0;
  const built = inputs.reduce(
    (acc, input) => applyTodoOp(acc, { type: "card-create", title: input.title, ...(input.dueDate !== undefined && { dueDate: input.dueDate }), ...(input.startDate !== undefined && { startDate: input.startDate }), ...(input.statusId && { statusId: input.statusId }) }, { now: 1, newId: () => `c${++n}` }).board,
    defaultBoard(),
  );
  const cards = built.cards.map((card, index): TodoCard => {
    const input = inputs[index];
    return {
      ...card,
      jira: input?.jira ? [{ key: input.jira, url: `https://x/browse/${input.jira}` }] : [],
      jiraParent: input?.parent ? { key: input.parent, summary: `${input.parent} 스토리` } : null,
      archivedAt: input?.archived ? 5 : null,
    };
  });
  return { ...built, cards };
}

function describeRows(rows: TimelineRow[]): string[] {
  return rows.map((row) => {
    if (row.kind === "group") return `# ${row.key} ${row.summary}`;
    const indent = row.depth === 1 ? "  " : "";
    if (row.overdueDays !== null) return `${indent}${row.card.title} ← ${row.overdueDays}일 지남`;
    if (!row.span) return `${indent}${row.card.title} (이 주 밖)`;
    const { from, to, clippedStart, clippedEnd } = row.span;
    return `${indent}${row.card.title} ${row.mark} ${clippedStart ? "<" : ""}${from}-${to}${clippedEnd ? ">" : ""}`;
  });
}

describe("weekRows", () => {
  it("places cards whose span touches the week as bars or deadline dots, clipped at the week's edges", () => {
    const board = boardOf(
      { title: "수 마감", dueDate: "2026-11-25" },
      { title: "월~목", startDate: "2026-11-23", dueDate: "2026-11-26" },
      { title: "지난 주부터", startDate: "2026-11-19", dueDate: "2026-11-24" },
      { title: "다음 주까지", startDate: "2026-11-28", dueDate: "2026-12-02" },
      { title: "다음 주", dueDate: "2026-12-01" },
      { title: "백로그" },
    );
    expect(describeRows(weekRows(board, board.cards, THIS_WEEK, TODAY))).toEqual([
      "지난 주부터 bar <0-1",
      "월~목 bar 0-3",
      "수 마감 dot 2-2",
      "다음 주까지 bar 5-6>",
    ]);
  });

  it("lists open overdue cards first in this week only, with how many days they are late", () => {
    const board = boardOf(
      { title: "이번 주 일", dueDate: "2026-11-24" },
      { title: "밀린 일", dueDate: "2026-11-20" },
      { title: "끝난 지난 일", dueDate: "2026-11-19", statusId: "st-done" },
    );
    expect(describeRows(weekRows(board, board.cards, THIS_WEEK, TODAY))).toEqual(["밀린 일 ← 5일 지남", "이번 주 일 dot 1-1"]);
    expect(describeRows(weekRows(board, board.cards, "2026-11-16", TODAY))).toEqual(["끝난 지난 일 dot 3-3", "밀린 일 dot 4-4"]);
  });

  it("puts sub-issues under their story card, and under a header when the story has no card", () => {
    const board = boardOf(
      { title: "UI 구현", dueDate: "2026-11-24", jira: "COMP-641", parent: "COMP-603" },
      { title: "단독 일", dueDate: "2026-11-23" },
      { title: "로그인 스토리", dueDate: "2026-12-10", jira: "COMP-603" },
      { title: "E2E 환경", startDate: "2026-11-25", dueDate: "2026-11-27", jira: "COMP-644", parent: "COMP-603" },
      { title: "바텀시트 하위", dueDate: "2026-11-26", jira: "COMP-700", parent: "COMP-623" },
    );
    expect(describeRows(weekRows(board, board.cards, THIS_WEEK, TODAY))).toEqual([
      "단독 일 dot 0-0",
      "로그인 스토리 (이 주 밖)",
      "  UI 구현 dot 1-1",
      "  E2E 환경 bar 2-4",
      "# COMP-623 COMP-623 스토리",
      "  바텀시트 하위 dot 3-3",
    ]);
  });

  it("shows an overdue story once, as the head of its sub-issues, at the top", () => {
    const board = boardOf(
      { title: "단독 일", dueDate: "2026-11-23" },
      { title: "밀린 스토리", dueDate: "2026-11-18", jira: "AB-1" },
      { title: "하위 일", dueDate: "2026-11-25", jira: "AB-2", parent: "AB-1" },
    );
    expect(describeRows(weekRows(board, board.cards, THIS_WEEK, TODAY))).toEqual(["밀린 스토리 ← 7일 지남", "  하위 일 dot 2-2", "단독 일 dot 0-0"]);
  });

  it("leaves out archived cards and cards the filter hides", () => {
    const board = boardOf({ title: "보관함", dueDate: "2026-11-24", archived: true }, { title: "숨김", dueDate: "2026-11-24" }, { title: "보임", dueDate: "2026-11-24" });
    const visible = board.cards.filter((card) => card.title !== "숨김");
    expect(describeRows(weekRows(board, visible, THIS_WEEK, TODAY))).toEqual(["보임 dot 1-1"]);
  });
});

describe("earliestWeekOffset", () => {
  it("reaches back to the earliest week holding a card, done ones included, and never past this week otherwise", () => {
    expect(earliestWeekOffset(boardOf({ title: "다음 주", dueDate: "2026-12-01" }, { title: "백로그" }).cards, TODAY, 1)).toBe(0);
    expect(earliestWeekOffset(boardOf({ title: "3주 전 끝남", dueDate: "2026-11-04", statusId: "st-done" }).cards, TODAY, 1)).toBe(-3);
    expect(earliestWeekOffset(boardOf({ title: "시작이 2주 전", startDate: "2026-11-10", dueDate: "2026-11-24" }).cards, TODAY, 1)).toBe(-2);
    expect(earliestWeekOffset(boardOf({ title: "보관함", dueDate: "2026-10-01", archived: true }).cards, TODAY, 1)).toBe(0);
  });
});

describe("dragPatch", () => {
  const card = (startDate: string | null, dueDate: string) => boardOf({ title: "a", startDate: startDate ?? undefined, dueDate }).cards[0] as TodoCard;

  it("moves the whole span with the body and each day with its end", () => {
    expect(dragPatch(card("2026-11-23", "2026-11-25"), "move", 2)).toEqual({ startDate: "2026-11-25", dueDate: "2026-11-27" });
    expect(dragPatch(card(null, "2026-11-25"), "move", -1)).toEqual({ dueDate: "2026-11-24" });
    expect(dragPatch(card("2026-11-23", "2026-11-25"), "end", 3)).toEqual({ dueDate: "2026-11-28" });
    expect(dragPatch(card("2026-11-23", "2026-11-25"), "start", 1)).toEqual({ startDate: "2026-11-24" });
  });

  it("creates a start day by pulling a deadline mark's handle left, and never crosses the ends", () => {
    expect(dragPatch(card(null, "2026-11-25"), "start", -2)).toEqual({ startDate: "2026-11-23" });
    expect(dragPatch(card(null, "2026-11-25"), "start", 1)).toBeNull();
    expect(dragPatch(card("2026-11-23", "2026-11-25"), "start", 5)).toEqual({ startDate: "2026-11-25" });
    expect(dragPatch(card("2026-11-23", "2026-11-25"), "end", -5)).toEqual({ dueDate: "2026-11-23" });
    expect(dragPatch(card("2026-11-23", "2026-11-25"), "move", 0)).toBeNull();
  });
});

describe("dropPatch", () => {
  const card = (startDate: string | null, dueDate: string | null) =>
    boardOf({ title: "a", startDate: startDate ?? undefined, dueDate: dueDate ?? undefined }).cards[0] as TodoCard;

  it("sets the deadline to the dropped day and keeps a span's length", () => {
    expect(dropPatch(card(null, null), "2026-11-26")).toEqual({ dueDate: "2026-11-26" });
    expect(dropPatch(card("2026-11-23", "2026-11-25"), "2026-11-27")).toEqual({ startDate: "2026-11-25", dueDate: "2026-11-27" });
    expect(dropPatch(card("2026-11-23", null), "2026-11-20")).toEqual({ startDate: null, dueDate: "2026-11-20" });
  });
});
