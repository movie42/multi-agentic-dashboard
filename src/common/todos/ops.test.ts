import { describe, expect, it } from "vitest";
import { defaultBoard } from "./board";
import { applyTodoOp, todoOpSchema, type TodoOp } from "./ops";
import type { TodoBoard } from "./types";

const SESSION = "0b8c1a7e-1234-4abc-8def-0123456789ab";

function run(board: TodoBoard, ...ops: TodoOp[]) {
  let n = 0;
  return ops.reduce((acc, op) => applyTodoOp(acc, op, { now: 10, newId: () => `id-${++n}` }).board, board);
}

describe("todoOpSchema", () => {
  it.each([
    [{ type: "card-create", title: "할 일" }, true],
    [{ type: "card-create", title: "  " }, false],
    [{ type: "card-update", cardId: "c", worktreePath: "relative" }, false],
    [{ type: "session-attach", cardId: "c", sessionId: "nope" }, false],
    [{ type: "status-create", name: "막힘", description: "다른 일을 기다릴 때" }, true],
    [{ type: "status-create", name: "막힘", description: "두\n줄" }, false],
    [{ type: "card-move", cardId: "c", statusId: "s", source: "agent" }, true],
    [{ type: "card-move", cardId: "c", statusId: "s", source: "auto" }, false],
    [{ type: "card-update", cardId: "c", dueDate: "2026-11-25" }, true],
    [{ type: "card-update", cardId: "c", dueDate: null }, true],
    [{ type: "card-update", cardId: "c", dueDate: "11/25" }, false],
    [{ type: "card-update", cardId: "c", dueDate: "2026-02-31" }, false],
    [{ type: "card-update", cardId: "c", dueDate: "2026-13-01" }, false],
    [{ type: "card-update", cardId: "c", startDate: "2026-11-23" }, true],
    [{ type: "card-update", cardId: "c", startDate: "2026-02-31" }, false],
    [{ type: "card-create", title: "a", startDate: "2026-11-23", dueDate: "2026-11-25" }, true],
    [{ type: "cards-carry-over", cardIds: ["a"] }, true],
    [{ type: "settings-update", weekStartsOn: 3 }, true],
    [{ type: "settings-update", weekStartsOn: 7 }, false],
  ])("%j → %s", (value, ok) => {
    expect(todoOpSchema.safeParse(value).success).toBe(ok);
  });
});

describe("applyTodoOp", () => {
  it("creates a card on the first status and returns its id", () => {
    const result = applyTodoOp(defaultBoard(), { type: "card-create", title: " 로그인 " }, { now: 1, newId: () => "c1" });
    expect(result.createdId).toBe("c1");
    expect(result.board.cards[0]).toMatchObject({ id: "c1", title: "로그인", statusId: "st-todo" });
  });

  it("parses jira urls into key chips and refuses anything else", () => {
    const board = run(defaultBoard(), { type: "card-create", title: "a" });
    const next = run(board, { type: "card-update", cardId: "id-1", jiraUrls: ["https://x.atlassian.net/browse/APP-1", ""] });
    expect(next.cards[0]?.jira).toEqual([{ key: "APP-1", url: "https://x.atlassian.net/browse/APP-1" }]);
    expect(() => run(board, { type: "card-update", cardId: "id-1", jiraUrls: ["https://example.com"] })).toThrow("지라");
  });

  it("keeps a session on one card only", () => {
    const board = run(
      defaultBoard(),
      { type: "card-create", title: "a" },
      { type: "card-create", title: "b" },
    );
    const attached = run(board, { type: "session-attach", cardId: "id-1", sessionId: SESSION });
    const moved = run(attached, { type: "session-attach", cardId: "id-2", sessionId: SESSION });
    expect(moved.cards.map((card) => card.sessionIds)).toEqual([[], [SESSION]]);
  });

  it("records a pending launch only for a card with a worktree", () => {
    const board = run(defaultBoard(), { type: "card-create", title: "a" });
    expect(() => run(board, { type: "card-launch", cardId: "id-1" })).toThrow("워크트리");
    const next = run(board, { type: "card-update", cardId: "id-1", worktreePath: "/w" }, { type: "card-launch", cardId: "id-1" });
    expect(next.cards[0]?.pendingLaunch).toEqual({ worktreePath: "/w", at: 10 });
  });

  it("sets and clears a card's deadline", () => {
    const board = run(defaultBoard(), { type: "card-create", title: "a", dueDate: "2026-11-27" });
    expect(board.cards[0]?.dueDate).toBe("2026-11-27");
    expect(run(board, { type: "card-update", cardId: "id-1", dueDate: null }).cards[0]?.dueDate).toBeNull();
  });

  it("sets a start day and refuses one later than the deadline", () => {
    const board = run(defaultBoard(), { type: "card-create", title: "a", startDate: "2026-11-23", dueDate: "2026-11-27" });
    expect(board.cards[0]).toMatchObject({ startDate: "2026-11-23", dueDate: "2026-11-27" });
    expect(() => run(board, { type: "card-update", cardId: "id-1", dueDate: "2026-11-22" })).toThrow("시작일");
    expect(() => run(board, { type: "card-update", cardId: "id-1", startDate: "2026-11-28" })).toThrow("시작일");
    const moved = run(board, { type: "card-update", cardId: "id-1", startDate: "2026-11-30", dueDate: "2026-12-04" });
    expect(moved.cards[0]).toMatchObject({ startDate: "2026-11-30", dueDate: "2026-12-04" });
    expect(run(board, { type: "card-update", cardId: "id-1", startDate: null, dueDate: null }).cards[0]).toMatchObject({ startDate: null, dueDate: null });
  });

  it("changes the weekday sprints start on", () => {
    expect(run(defaultBoard(), { type: "settings-update", weekStartsOn: 3 }).settings.weekStartsOn).toBe(3);
  });

  it("carries open cards from earlier sprints into this one and leaves the rest", () => {
    // now = 2026-11-25 (Wed) local; sprints start on Monday 11/23.
    const now = new Date(2026, 10, 25, 12).getTime();
    let n = 0;
    const ops: TodoOp[] = [
      { type: "card-create", title: "지난 주 금요일", dueDate: "2026-11-20" },
      { type: "card-create", title: "지난 주 끝난 일", dueDate: "2026-11-20", statusId: "st-done" },
      { type: "card-create", title: "이번 주 월요일", dueDate: "2026-11-23" },
      { type: "card-create", title: "백로그" },
      { type: "cards-carry-over" },
    ];
    const board = ops.reduce((acc, op) => applyTodoOp(acc, op, { now, newId: () => `id-${++n}` }).board, defaultBoard());
    expect(board.cards.map((card) => card.dueDate)).toEqual(["2026-11-27", "2026-11-20", "2026-11-23", null]);
  });

  it("carries over only the cards it names when a list is given", () => {
    const now = new Date(2026, 10, 25, 12).getTime();
    let n = 0;
    const ops: TodoOp[] = [
      { type: "card-create", title: "A 프로젝트", dueDate: "2026-11-20" },
      { type: "card-create", title: "B 프로젝트", dueDate: "2026-11-20" },
      { type: "cards-carry-over", cardIds: ["id-1"] },
    ];
    const board = ops.reduce((acc, op) => applyTodoOp(acc, op, { now, newId: () => `id-${++n}` }).board, defaultBoard());
    expect(board.cards.map((card) => card.dueDate)).toEqual(["2026-11-27", "2026-11-20"]);
  });

  it("moves the start day along with the deadline when carrying a card over", () => {
    const now = new Date(2026, 10, 25, 12).getTime();
    let n = 0;
    const ops: TodoOp[] = [
      { type: "card-create", title: "기간 있는 일", startDate: "2026-11-18", dueDate: "2026-11-20" },
      { type: "cards-carry-over" },
    ];
    const board = ops.reduce((acc, op) => applyTodoOp(acc, op, { now, newId: () => `id-${++n}` }).board, defaultBoard());
    expect(board.cards[0]).toMatchObject({ startDate: "2026-11-25", dueDate: "2026-11-27" });
  });
});
