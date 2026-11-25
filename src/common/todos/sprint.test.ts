import { describe, expect, it } from "vitest";
import { defaultBoard } from "./board";
import { addDays, carryOverDay, isTodoDay, dayOf, inScope, isOverdue, newCardDueDate, sprintDays, sprintStart } from "./sprint";
import type { TodoBoard, TodoCard } from "./types";

function card(patch: Partial<TodoCard>): TodoCard {
  return {
    id: "c",
    title: "카드",
    memo: "",
    statusId: "st-todo",
    jira: [],
    links: [],
    sessionIds: [],
    ignoredSessionIds: [],
    repo: null,
    worktreePath: null,
    hidden: false,
    agentMovedAt: null,
    doneSuggestedAt: null,
    pendingLaunch: null,
    doneAt: null,
    archivedAt: null,
    origin: null,
    dueDate: null,
    startDate: null,
    jiraParent: null,
    jiraParentChecked: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

const board: TodoBoard = defaultBoard();
// 2026-11-25 is a Wednesday.
const TODAY = "2026-11-25";

describe("day arithmetic", () => {
  it("reads a timestamp as the local calendar day", () => {
    expect(dayOf(new Date(2026, 10, 25, 23, 59).getTime())).toBe("2026-11-25");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("starts a sprint on the configured weekday", () => {
    expect(sprintStart(TODAY, 1)).toBe("2026-11-23");
    expect(sprintStart("2026-11-23", 1)).toBe("2026-11-23");
    expect(sprintStart(TODAY, 3)).toBe("2026-11-25");
    expect(sprintStart(TODAY, 4)).toBe("2026-11-19");
    expect(sprintStart(TODAY, 0)).toBe("2026-11-22");
  });

  it("lists the seven days of a sprint", () => {
    expect(sprintDays("2026-11-30")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  });
});

describe("isOverdue", () => {
  it("is a past deadline on a card not in the last status", () => {
    expect(isOverdue(board, card({ dueDate: "2026-11-24" }), TODAY)).toBe(true);
    expect(isOverdue(board, card({ dueDate: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(board, card({ dueDate: null }), TODAY)).toBe(false);
    expect(isOverdue(board, card({ dueDate: "2026-11-24", statusId: "st-done" }), TODAY)).toBe(false);
    expect(isOverdue(board, card({ dueDate: "2026-11-24", archivedAt: 1 }), TODAY)).toBe(false);
  });
});

describe("inScope", () => {
  const thisWeek = card({ dueDate: "2026-11-29" });
  const nextWeek = card({ dueDate: "2026-11-30" });
  const lastWeekOpen = card({ dueDate: "2026-11-20" });
  const lastWeekDone = card({ dueDate: "2026-11-20", statusId: "st-done" });
  const backlog = card({ dueDate: null });

  it("this sprint holds this week's deadlines and overdue cards from earlier weeks", () => {
    expect([thisWeek, nextWeek, lastWeekOpen, lastWeekDone, backlog].map((each) => inScope(board, each, "this", TODAY, 1))).toEqual([
      true,
      false,
      true,
      false,
      false,
    ]);
  });

  it("next sprint holds only next week's deadlines", () => {
    expect([thisWeek, nextWeek, lastWeekOpen].map((each) => inScope(board, each, "next", TODAY, 1))).toEqual([false, true, false]);
  });

  it("backlog holds cards with no deadline, all holds everything", () => {
    expect([thisWeek, backlog].map((each) => inScope(board, each, "backlog", TODAY, 1))).toEqual([false, true]);
    expect([thisWeek, nextWeek, backlog].every((each) => inScope(board, each, "all", TODAY, 1))).toBe(true);
  });

  it("follows the configured week start", () => {
    // Weeks start on Thursday: this sprint is 11/19–11/25, so 11/26 is next sprint.
    expect(inScope(board, card({ dueDate: "2026-11-26" }), "this", TODAY, 4)).toBe(false);
    expect(inScope(board, card({ dueDate: "2026-11-26" }), "next", TODAY, 4)).toBe(true);
  });
});

describe("carryOverDay", () => {
  it("keeps the weekday and lands in this sprint", () => {
    expect(carryOverDay("2026-11-20", "2026-11-23", 1)).toBe("2026-11-27");
    expect(carryOverDay("2026-11-06", "2026-11-23", 1)).toBe("2026-11-27");
  });

  it("never lands before today", () => {
    expect(carryOverDay("2026-11-16", TODAY, 1)).toBe(TODAY);
  });
});

describe("newCardDueDate", () => {
  it("gives a new card the last day of the chosen sprint so it stays in view", () => {
    expect(newCardDueDate("this", TODAY, 1)).toBe("2026-11-29");
    expect(newCardDueDate("next", TODAY, 1)).toBe("2026-12-06");
    expect(newCardDueDate("backlog", TODAY, 1)).toBeNull();
    expect(newCardDueDate("all", TODAY, 1)).toBeNull();
  });
});

describe("isTodoDay", () => {
  it("accepts only real calendar days", () => {
    expect(["2026-11-25", "2028-02-29"].map(isTodoDay)).toEqual([true, true]);
    expect(["2026-02-29", "2026-02-31", "2026-13-01", "11/25", ""].map(isTodoDay)).toEqual([false, false, false, false, false]);
  });
});
