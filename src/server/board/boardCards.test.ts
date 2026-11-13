import { describe, expect, it } from "vitest";
import { buildAgentCard, buildWorktreeSummary, stateOf, worktreeName, worktreeOfCwd } from "./boardCards";
import { boardWorktree, runnerSession } from "./boardFixtures";

const flow = { current: [], other: [] };
const info = { pullRequest: { kind: "none" } as const, jira: { kind: "not-applicable" } as const };

describe("stateOf", () => {
  it("maps the daemon's status to the board's states", () => {
    expect(stateOf(runnerSession({ status: "working" }))).toBe("working");
    expect(stateOf(runnerSession({ status: "waiting" }))).toBe("blocked");
  });

  it("calls an idle session done only after it has been given a prompt", () => {
    expect(stateOf(runnerSession({ status: "idle", prompted: true }))).toBe("done");
    expect(stateOf(runnerSession({ status: "idle", prompted: false }))).toBe("idle");
  });
});

describe("worktreeName", () => {
  it("prefers the name the user gave, then the branch, then the folder name", () => {
    expect(worktreeName(boardWorktree({ meta: { displayName: "My work" } }))).toBe("My work");
    expect(worktreeName(boardWorktree())).toBe("feat/x");
    expect(worktreeName(boardWorktree({ branch: null, path: "/a/notes" }))).toBe("notes");
  });
});

describe("worktreeOfCwd", () => {
  const worktrees = [{ path: "/w" }, { path: "/w/nested" }, { path: "/w2" }];

  it("finds the worktree a session's folder is in, the deepest when they nest", () => {
    expect(worktreeOfCwd("/w", worktrees)?.path).toBe("/w");
    expect(worktreeOfCwd("/w/src/app", worktrees)?.path).toBe("/w");
    expect(worktreeOfCwd("/w/nested/src", worktrees)?.path).toBe("/w/nested");
  });

  it("does not match a sibling folder that only shares a prefix", () => {
    expect(worktreeOfCwd("/w3", worktrees)).toBeNull();
    expect(worktreeOfCwd("/w2x/src", worktrees)).toBeNull();
  });
});

describe("buildWorktreeSummary", () => {
  it("uses the path as the id and keeps a parent only while that worktree is still listed", () => {
    const worktree = boardWorktree({ path: "/w-child", meta: { parentPath: "/w" } });
    const base = { worktree, flow, ...info, lastActivityAt: 5 };
    expect(buildWorktreeSummary({ ...base, livePaths: new Set(["/w", "/w-child"]) })).toMatchObject({
      worktreeId: "/w-child",
      repo: "repo",
      name: "feat/x",
      parentWorktreeId: "/w",
      lastActivityAt: 5,
    });
    expect(buildWorktreeSummary({ ...base, livePaths: new Set(["/w-child"]) }).parentWorktreeId).toBeNull();
  });
});

describe("buildAgentCard", () => {
  it("points the card's terminal at the daemon session and attaches the bookmark", () => {
    const bookmark = { name: "keep", memo: "", createdAt: "", lastOpenedAt: null };
    const card = buildAgentCard({
      session: runnerSession({ id: "abc", status: "idle" }),
      worktree: boardWorktree(),
      prompt: "do it",
      lastMessage: "done",
      sessionRef: { id: "abc", title: "Title", titleSource: "ai", bookmark: null },
      bookmarks: new Map([["abc", bookmark]]),
      artifacts: [],
    });
    expect(card).toMatchObject({
      id: "abc",
      terminalHandle: "abc",
      agentType: "claude",
      state: "done",
      prompt: "do it",
      lastMessage: "done",
      worktreeId: "/w",
      session: { id: "abc", title: "Title", bookmark },
    });
  });
});
