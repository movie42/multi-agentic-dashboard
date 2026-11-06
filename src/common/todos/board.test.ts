import { describe, expect, it } from "vitest";
import {
  createColumn,
  createStatus,
  defaultBoard,
  deleteColumn,
  deleteStatus,
  moveCard,
  reorderStatuses,
  setColumnStatuses,
  suggestDone,
  TodoRuleError,
  updateStatus,
} from "./board";
import { parseJiraUrl } from "./jira";
import { todoBoardSchema } from "./schema";
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
    agentMovedAt: null,
    doneSuggestedAt: null,
    pendingLaunch: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

const withCards = (board: TodoBoard, ...cards: TodoCard[]): TodoBoard => ({ ...board, cards });

describe("defaultBoard", () => {
  it("lays out four statuses with the review column hidden", () => {
    const board = defaultBoard();
    expect(board.statuses.map((status) => `${status.name}→${status.next.join(",")}`)).toEqual([
      "할일→st-progress",
      "진행 중→st-review,st-todo",
      "리뷰→st-done,st-progress",
      "끝→st-progress",
    ]);
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
    const next = createStatus(defaultBoard(), { id: "st-block", name: "막힘" });
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
  it("lets a person move anywhere and clears the agent marks", () => {
    const board = withCards(defaultBoard(), { ...card("a", "st-progress"), agentMovedAt: 3, doneSuggestedAt: 3 });
    const moved = moveCard(board, "a", "st-done", 6);
    expect(moved.cards[0]).toMatchObject({ statusId: "st-done", agentMovedAt: null, doneSuggestedAt: null });
  });

  it("makes an agent follow the transitions and marks its move", () => {
    const board = withCards(defaultBoard(), card("a", "st-todo"));
    expect(() => moveCard(board, "a", "st-review", 5, "agent")).toThrow("전환");
    expect(moveCard(board, "a", "st-progress", 5, "agent").cards[0]?.agentMovedAt).toBe(5);
  });

  it("never lets an agent reach the last status, only suggest it", () => {
    const board = withCards(defaultBoard(), card("a", "st-review"));
    expect(() => moveCard(board, "a", "st-done", 5, "agent")).toThrow("끝 상태");
    expect(suggestDone(board, "a", 5).cards[0]?.doneSuggestedAt).toBe(5);
  });
});

describe("transitions", () => {
  it("refuses a transition to itself or to a missing status", () => {
    const board = defaultBoard();
    expect(() => updateStatus(board, "st-todo", { next: ["st-todo"] })).toThrow(TodoRuleError);
    expect(() => updateStatus(board, "st-todo", { next: ["nope"] })).toThrow(TodoRuleError);
  });

  it("drops a deleted status from every transition", () => {
    const next = deleteStatus(defaultBoard(), "st-review", undefined, 1);
    expect(next.statuses.find((status) => status.id === "st-progress")?.next).toEqual(["st-todo"]);
  });
});

describe("todoBoardSchema", () => {
  it("reads a file written with status kinds and fills linear transitions", () => {
    const legacy = {
      version: 1,
      statuses: [
        { id: "a", name: "A", kind: "standby" },
        { id: "b", name: "B", kind: "progress" },
        { id: "c", name: "C", kind: "done" },
      ],
      columns: [{ id: "col", name: "all", statusIds: ["a", "b", "c"], hidden: false }],
      cards: [{ ...card("x", "b"), agentMovedAt: undefined, doneSuggestedAt: undefined, autoMovedAt: 9 }],
    };
    const board = todoBoardSchema.parse(legacy);
    expect(board.statuses).toEqual([
      { id: "a", name: "A", description: "", next: ["b"] },
      { id: "b", name: "B", description: "", next: ["c", "a"] },
      { id: "c", name: "C", description: "", next: ["b"] },
    ]);
    expect(board.cards[0]).toMatchObject({ agentMovedAt: 9, doneSuggestedAt: null });
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
