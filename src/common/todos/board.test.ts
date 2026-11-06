import { describe, expect, it } from "vitest";
import { autoMoveTarget } from "./autoMove";
import {
  createColumn,
  createStatus,
  defaultBoard,
  deleteColumn,
  deleteStatus,
  moveCard,
  reorderStatuses,
  setColumnStatuses,
  TodoRuleError,
} from "./board";
import { parseJiraUrl } from "./jira";
import type { TodoBoard, TodoCard } from "./types";

function card(id: string, statusId: string): TodoCard {
  return {
    id,
    title: id,
    memo: "",
    statusId,
    jira: [],
    sessionIds: [],
    repo: null,
    worktreePath: null,
    hidden: false,
    autoMovedAt: null,
    pendingLaunch: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

const withCards = (board: TodoBoard, ...cards: TodoCard[]): TodoBoard => ({ ...board, cards });

describe("defaultBoard", () => {
  it("lays out four statuses with the review column hidden", () => {
    const board = defaultBoard();
    expect(board.statuses.map((status) => `${status.name}:${status.kind}`)).toEqual(["할일:standby", "진행 중:progress", "리뷰:review", "끝:done"]);
    expect(board.columns.filter((column) => column.hidden).map((column) => column.name)).toEqual(["리뷰"]);
  });
});

describe("deleteStatus", () => {
  it("refuses the first and the last status", () => {
    const board = defaultBoard();
    expect(() => deleteStatus(board, "st-todo", undefined, 1)).toThrow(TodoRuleError);
    expect(() => deleteStatus(board, "st-done", undefined, 1)).toThrow(TodoRuleError);
  });

  it("asks where the cards go, then moves them before deleting", () => {
    const board = withCards(defaultBoard(), card("a", "st-progress"));
    expect(() => deleteStatus(board, "st-progress", undefined, 1)).toThrow("카드 1개");
    const next = deleteStatus(board, "st-progress", "st-todo", 1);
    expect(next.statuses.map((status) => status.id)).not.toContain("st-progress");
    expect(next.cards[0]?.statusId).toBe("st-todo");
    expect(next.columns.find((column) => column.id === "col-progress")?.statusIds).toEqual([]);
  });
});

describe("statuses and columns", () => {
  it("inserts a new status before the last one in its own column", () => {
    const next = createStatus(defaultBoard(), { id: "st-block", name: "막힘", kind: "block" });
    expect(next.statuses.map((status) => status.id)).toEqual(["st-todo", "st-progress", "st-review", "st-block", "st-done"]);
    expect(next.columns.map((column) => column.id)).toEqual(["col-todo", "col-progress", "col-review", "col-st-block", "col-done"]);
  });

  it("keeps first and last statuses in place when reordering", () => {
    const board = defaultBoard();
    expect(() => reorderStatuses(board, ["st-progress", "st-todo", "st-review", "st-done"])).toThrow(TodoRuleError);
    expect(reorderStatuses(board, ["st-todo", "st-review", "st-progress", "st-done"]).statuses[1]?.id).toBe("st-review");
  });

  it("moves a status into a column out of its old one, in workflow order", () => {
    const next = setColumnStatuses(defaultBoard(), "col-progress", ["st-review", "st-progress"]);
    expect(next.columns.find((column) => column.id === "col-progress")?.statusIds).toEqual(["st-progress", "st-review"]);
    expect(next.columns.find((column) => column.id === "col-review")?.statusIds).toEqual([]);
    expect(() => setColumnStatuses(next, "col-progress", ["st-progress"])).toThrow(TodoRuleError);
  });

  it("hands a deleted column's statuses to the chosen column", () => {
    const board = createColumn(defaultBoard(), { id: "col-x", name: "x" });
    expect(() => deleteColumn(board, "col-review", undefined)).toThrow(TodoRuleError);
    expect(deleteColumn(board, "col-x", undefined).columns).toHaveLength(4);
    const next = deleteColumn(board, "col-review", "col-progress");
    expect(next.columns.find((column) => column.id === "col-progress")?.statusIds).toEqual(["st-progress", "st-review"]);
  });
});

describe("moveCard", () => {
  it("marks auto moves and clears the mark on a user move", () => {
    const board = withCards(defaultBoard(), card("a", "st-todo"));
    const auto = moveCard(board, "a", "st-progress", 5, true);
    expect(auto.cards[0]?.autoMovedAt).toBe(5);
    expect(moveCard(auto, "a", "st-todo", 6).cards[0]?.autoMovedAt).toBeNull();
  });
});

describe("autoMoveTarget", () => {
  const board = defaultBoard();

  it("moves forward to the first status of the matching kind", () => {
    expect(autoMoveTarget(board, card("a", "st-todo"), "session-started")).toBe("st-progress");
    expect(autoMoveTarget(board, card("a", "st-progress"), "pr-opened")).toBe("st-review");
  });

  it("never moves backward or out of done", () => {
    expect(autoMoveTarget(board, card("a", "st-review"), "session-started")).toBeNull();
    expect(autoMoveTarget(board, card("a", "st-done"), "pr-opened")).toBeNull();
  });

  it("never moves out of a done-kind status in the middle of the workflow", () => {
    const shipped = createStatus(board, { id: "st-shipped", name: "배포", kind: "done" });
    const reordered = reorderStatuses(shipped, ["st-todo", "st-shipped", "st-progress", "st-review", "st-done"]);
    expect(autoMoveTarget(reordered, card("a", "st-shipped"), "session-started")).toBeNull();
  });
});

describe("parseJiraUrl", () => {
  it.each([
    ["https://acme.atlassian.net/browse/APP-451", "APP-451"],
    ["https://acme.atlassian.net/jira/software/projects/APP/boards/1?selectedIssue=APP-12", "APP-12"],
    ["https://acme.atlassian.net/browse/app-7?focus=1", "APP-7"],
  ])("%s → %s", (url, key) => {
    expect(parseJiraUrl(url)?.key).toBe(key);
  });

  it.each(["not a url", "javascript:alert(1)", "https://acme.atlassian.net/jira/your-work"])("rejects %s", (url) => {
    expect(parseJiraUrl(url)).toBeNull();
  });
});
