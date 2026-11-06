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
    [{ type: "status-create", name: "막힘", kind: "block" }, true],
    [{ type: "status-create", name: "막힘", kind: "blocked" }, false],
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
});
