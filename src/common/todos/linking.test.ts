import { describe, expect, it } from "vitest";
import { defaultBoard, moveCard, restoreCard } from "./board";
import { applyTodoOp } from "./ops";
import { ARCHIVE_AFTER_MS, archiveDue, linkSessions, linkWorktrees, type LinkableSession, type LinkableWorktree } from "./linking";
import type { TodoBoard, TodoCard } from "./types";

const DAY = ARCHIVE_AFTER_MS;

function card(overrides: Partial<TodoCard>): TodoCard {
  return {
    id: "c1",
    title: "c1",
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
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function boardWith(...cards: TodoCard[]): TodoBoard {
  return { ...defaultBoard(), cards };
}

const jira = (key: string) => [{ key, url: `https://x.atlassian.net/browse/${key}` }];

function worktree(overrides: Partial<LinkableWorktree>): LinkableWorktree {
  return { path: "/repo/wt", repo: "repo", name: "wt", branch: null, isMain: false, ...overrides };
}

function session(overrides: Partial<LinkableSession>): LinkableSession {
  return { id: "s1", cwd: null, branch: null, headless: false, ...overrides };
}

describe("archiveDue", () => {
  it("archives a card a day after it reached the last status", () => {
    const board = boardWith(card({ statusId: "st-done", doneAt: 0 }));
    expect(archiveDue(board, DAY - 1)).toBe(board);
    expect(archiveDue(board, DAY).cards[0]?.archivedAt).toBe(DAY);
  });

  it("starts the day for a done card that has no doneAt yet", () => {
    const next = archiveDue(boardWith(card({ statusId: "st-done" })), 5);
    expect(next.cards[0]).toMatchObject({ doneAt: 5, archivedAt: null });
  });

  it("leaves cards outside the last status alone", () => {
    const board = boardWith(card({ statusId: "st-progress", doneAt: 0 }));
    expect(archiveDue(board, DAY * 3)).toBe(board);
  });
});

describe("done and restore", () => {
  it("records doneAt on a move into the last status and clears it on the way out", () => {
    const done = moveCard(boardWith(card({})), "c1", "st-done", 10);
    expect(done.cards[0]?.doneAt).toBe(10);
    expect(moveCard(done, "c1", "st-progress", 20).cards[0]?.doneAt).toBeNull();
  });

  it("restores an archived card to the latest shown status before the last", () => {
    const board = boardWith(card({ statusId: "st-done", doneAt: 0, archivedAt: DAY }));
    expect(restoreCard(board, "c1", DAY + 1).cards[0]).toMatchObject({ archivedAt: null, statusId: "st-progress", doneAt: null });
    const reviewShown = { ...board, columns: board.columns.map((column) => ({ ...column, hidden: false })) };
    expect(restoreCard(reviewShown, "c1", DAY + 1).cards[0]?.statusId).toBe("st-review");
  });
});

describe("linkWorktrees", () => {
  it("links the one worktree whose branch carries the card's key", () => {
    const board = boardWith(card({ jira: jira("VDCO-35") }));
    const next = linkWorktrees(board, [worktree({ path: "/a", branch: "feat/VDCO-3518" }), worktree({ path: "/b", branch: "feat/vdco-35" })], 1);
    expect(next.cards[0]).toMatchObject({ worktreePath: "/b", repo: "repo" });
  });

  it("skips main worktrees and ambiguous matches", () => {
    const board = boardWith(card({ jira: jira("AB-1") }));
    expect(linkWorktrees(board, [worktree({ isMain: true, branch: "AB-1" })], 1)).toBe(board);
    expect(linkWorktrees(board, [worktree({ path: "/a", branch: "AB-1" }), worktree({ path: "/b", name: "AB-1-two" })], 1)).toBe(board);
  });
});

describe("linkSessions", () => {
  it("attaches sessions run in the card's worktree and sessions whose branch has the key", () => {
    const board = boardWith(card({ id: "w", worktreePath: "/repo/wt" }), card({ id: "k", jira: jira("AB-12") }));
    const next = linkSessions(
      board,
      [session({ id: "s1", cwd: "/repo/wt/src" }), session({ id: "s2", cwd: "/elsewhere", branch: "fix/AB-12-crash" }), session({ id: "s3", branch: "AB-123" })],
      new Set(),
      1,
    );
    expect(next.cards.find((each) => each.id === "w")?.sessionIds).toEqual(["s1"]);
    expect(next.cards.find((each) => each.id === "k")?.sessionIds).toEqual(["s2"]);
  });

  it("never takes a held, detached, headless or main-worktree session", () => {
    const board = boardWith(
      card({ id: "a", worktreePath: "/main", sessionIds: ["held"] }),
      card({ id: "b", worktreePath: "/repo/wt", ignoredSessionIds: ["gone"] }),
    );
    const sessions = [
      session({ id: "held", cwd: "/repo/wt" }),
      session({ id: "gone", cwd: "/repo/wt" }),
      session({ id: "bot", cwd: "/repo/wt", headless: true }),
      session({ id: "m", cwd: "/main" }),
    ];
    expect(linkSessions(board, sessions, new Set(["/main"]), 1)).toBe(board);
  });

  it("skips archived cards", () => {
    const board = boardWith(card({ worktreePath: "/repo/wt", archivedAt: 1 }));
    expect(linkSessions(board, [session({ cwd: "/repo/wt" })], new Set(), 2)).toBe(board);
  });

  it("a detach is remembered, and a manual attach forgets it", () => {
    const ctx = { now: 1, newId: () => "x" };
    const attached = boardWith(card({ worktreePath: "/repo/wt", sessionIds: ["s1"] }));
    const detached = applyTodoOp(attached, { type: "session-detach", cardId: "c1", sessionId: "s1" }, ctx).board;
    expect(linkSessions(detached, [session({ cwd: "/repo/wt" })], new Set(), 2)).toBe(detached);
    const again = applyTodoOp(detached, { type: "session-attach", cardId: "c1", sessionId: "s1" }, ctx).board;
    expect(again.cards[0]?.ignoredSessionIds).toEqual([]);
  });
});
