import { describe, expect, it, vi } from "vitest";
import type { PendingPermission } from "@/common/permissions/types";
import { fakeFileSystem } from "@/server/shared/fakes";
import { FeatureDocReader } from "@/server/workflow/FeatureDocReader";
import { FlowDocReader } from "@/server/workflow/FlowDocReader";
import type { GitInfo } from "@/server/workflow/GitInfo";
import { BoardService, type BoardServiceOptions } from "./BoardService";
import { rawAgent, rawWorktree } from "./boardFixtures";

const TASK = JSON.stringify({ id: "t1", branch: "feat/x", feature: { doc: "/w/docs/features/f1/feature.json" }, stages: { plan: { status: "now" } } });
const FEATURE = JSON.stringify({ id: "f1", title: "Feature", root: "develop", rows: [{ id: "r1", branch: "feat/x" }] });

function setup(overrides: Partial<BoardServiceOptions> = {}) {
  const fs = fakeFileSystem({
    "/w/docs/d/domain.json": { content: "{}" },
    "/w/docs/d/tasks/t1.json": { content: TASK },
    "/w/docs/features/f1/feature.json": { content: FEATURE },
    "/w/report.md": { content: "" },
  });
  const warn = vi.fn();
  const git = {
    getPullRequest: vi.fn(() => ({ kind: "none" }) as const),
    detectMode: vi.fn(async () => "personal" as const),
  } satisfies Pick<GitInfo, "getPullRequest" | "detectMode">;
  const worktrees = [
    rawWorktree({
      isMainWorktree: true,
      agents: [
        rawAgent({ paneKey: "t1:l1", lastAssistantMessage: "See /w/report.md and /w/missing.md" }),
        rawAgent({ paneKey: "t2:l2", agentType: "codex", state: "waiting", stateStartedAt: 50 }),
      ],
    }),
    rawWorktree({ worktreeId: "wt-old", path: "/old", isArchived: true }),
  ];
  const run = vi.fn(async (args: string[]) => {
    if (args[0] === "worktree") return { worktrees };
    return { terminals: [{ handle: "h1", tabId: "t1", leafId: "l1", worktreeId: "wt-1", title: null, connected: true }] };
  });
  const permission = { id: "p1", paneKey: "t2:l2" } as unknown as PendingPermission;
  const permissions = { settleStale: vi.fn(), pendingByPane: vi.fn(() => new Map([["t2:l2", permission]])) };
  const sessions = {
    findSession: vi.fn(async () => ({ file: "/s/abc.jsonl", size: 1, lastAssistant: "See /w/report.md and /w/missing.md" })),
    sessionRefOf: vi.fn(async () => ({ id: "abc", title: "Title", titleSource: "ai" as const, bookmark: null })),
    readBookmarks: vi.fn(async () => new Map()),
  };
  const orphans = { reattach: vi.fn(async () => {}) };
  const board = new BoardService({
    cli: { run } as unknown as BoardServiceOptions["cli"],
    orphans,
    workflow: {
      git,
      jira: { getIssue: () => ({ kind: "not-applicable" as const }) },
      flowDocs: new FlowDocReader(fs, warn),
      featureDocs: new FeatureDocReader({ fs, warn, pullRequestOf: git.getPullRequest }),
    },
    sessions,
    permissions,
    fs,
    warn,
    now: () => 123,
    ...overrides,
  });
  return { board, run, git, permissions, sessions, orphans, warn };
}

describe("BoardService.load", () => {
  it("assembles worktrees, agents, flow tasks, features and projects from live worktrees", async () => {
    const { board, permissions, orphans, warn } = setup();
    const snapshot = await board.load();

    expect(snapshot.fetchedAt).toBe(123);
    expect(snapshot.projects).toEqual([{ repo: "repo", autoMode: "personal" }]);
    expect(snapshot.worktrees).toHaveLength(1);
    expect(snapshot.worktrees[0]).toMatchObject({
      worktreeId: "wt-1",
      branch: "feat/x",
      pullRequest: { kind: "none" },
      jira: { kind: "not-applicable" },
      featureId: "f1",
      flowTasks: [expect.objectContaining({ taskId: "t1" })],
    });
    expect(snapshot.features).toEqual([expect.objectContaining({ id: "f1", repo: null })]);
    expect(snapshot.agents.map((agent) => [agent.id, agent.state, agent.terminalHandle])).toEqual([
      ["t1:l1", "working", "h1"],
      ["t2:l2", "waiting", null],
    ]);
    expect(snapshot.agents[0]?.session).toMatchObject({ id: "abc", title: "Title" });
    expect(snapshot.agents[0]?.artifacts.map((artifact) => artifact.target)).toEqual(["/w/report.md"]);
    expect(snapshot.agents[1]?.permission).toMatchObject({ id: "p1" });
    expect(permissions.settleStale).toHaveBeenCalledWith("t2:l2", "waiting", 50);
    expect(orphans.reattach).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back with warnings when terminals, bookmarks or sessions fail", async () => {
    const { board, run, sessions, warn } = setup();
    run.mockImplementation(async (args: string[]) => {
      if (args[0] === "terminal") throw new Error("terminal list failed");
      return { worktrees: [rawWorktree({ agents: [rawAgent({ lastAssistantMessage: "short" })] })] };
    });
    sessions.readBookmarks.mockRejectedValue(new Error("bookmarks"));
    sessions.findSession.mockRejectedValue(new Error("find"));
    const snapshot = await board.load();
    expect(snapshot.agents[0]).toMatchObject({ terminalHandle: null, session: null, lastMessage: "short" });
    expect(warn.mock.calls.map(([, , context]) => context.step)).toEqual(["terminal list", "bookmarks", "find session"]);
  });

  it("rejects when worktree ps fails", async () => {
    const { board, run } = setup();
    run.mockRejectedValue(new Error("orca down"));
    await expect(board.load()).rejects.toThrow("orca down");
  });
});
