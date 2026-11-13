import { describe, expect, it, vi } from "vitest";
import { fakeFileSystem } from "@/server/shared/fakes";
import { FeatureDocReader } from "@/server/workflow/FeatureDocReader";
import { FlowDocReader } from "@/server/workflow/FlowDocReader";
import type { GitInfo } from "@/server/workflow/GitInfo";
import { BoardService, type BoardServiceOptions } from "./BoardService";
import { PROJECT, runnerSession } from "./boardFixtures";

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
  const sessions = {
    transcriptOf: vi.fn(async (_cwd: string, id: string) =>
      id === "s1" ? { file: "/s/s1.jsonl", size: 1, firstPrompt: "do it", lastAssistant: "See /w/report.md and /w/missing.md" } : null,
    ),
    sessionRefOf: vi.fn(async () => ({ id: "s1", title: "Title", titleSource: "ai" as const, bookmark: null })),
    readBookmarks: vi.fn(async () => new Map()),
  };
  const runnerSessions = vi.fn(async () => [
    runnerSession({ id: "s2", cwd: "/w/src", status: "waiting", startedAt: 30, updatedAt: 50 }),
    runnerSession({ id: "s1", cwd: "/w", status: "working", startedAt: 10, updatedAt: 20 }),
    runnerSession({ id: "gone", cwd: "/w", status: "exited" }),
    runnerSession({ id: "elsewhere", cwd: "/other" }),
    runnerSession({ id: "sh", cwd: "/w-child", kind: "shell", status: "idle", prompted: false, startedAt: 40, updatedAt: 40 }),
  ]);
  const prepare = vi.fn(async () => {});
  const board = new BoardService({
    prepare,
    projects: async () => [PROJECT, { path: "/notes", name: "notes", kind: "folder" }],
    worktreesOf: async (project) =>
      project.kind === "folder"
        ? [{ path: "/notes", branch: null, isMain: true }]
        : [
            { path: "/w", branch: "feat/x", isMain: true },
            { path: "/w-child", branch: "feat/y", isMain: false },
          ],
    meta: async () => new Map([["/w-child", { displayName: "Child", parentPath: "/w", reference: "COMP-7" }]]),
    runnerSessions,
    workflow: {
      git,
      jira: { getIssue: vi.fn((branch: string | null) => (branch === "COMP-7" ? ({ kind: "loading", key: "COMP-7", url: null } as const) : ({ kind: "not-applicable" } as const))) },
      flowDocs: new FlowDocReader(fs, warn),
      featureDocs: new FeatureDocReader({ fs, warn, pullRequestOf: git.getPullRequest }),
    },
    sessions,
    fs,
    warn,
    now: () => 123,
    ...overrides,
  });
  return { board, git, sessions, runnerSessions, prepare, warn };
}

describe("BoardService.load", () => {
  it("builds the board from registered projects, their git worktrees and the daemon's sessions", async () => {
    const { board, prepare, warn } = setup();
    const snapshot = await board.load();

    expect(prepare).toHaveBeenCalledOnce();
    expect(snapshot.fetchedAt).toBe(123);
    expect(snapshot.projects).toEqual([
      { repo: "notes", autoMode: "personal" },
      { repo: "repo", autoMode: "personal" },
    ]);
    expect(snapshot.worktrees.map((worktree) => [worktree.worktreeId, worktree.repo, worktree.name, worktree.parentWorktreeId])).toEqual([
      ["/w", "repo", "feat/x", null],
      ["/w-child", "repo", "Child", "/w"],
      ["/notes", "notes", "notes", null],
    ]);
    expect(snapshot.worktrees[0]).toMatchObject({
      isMain: true,
      lastActivityAt: 50,
      pullRequest: { kind: "none" },
      jira: { kind: "not-applicable" },
      featureId: "f1",
      flowTasks: [expect.objectContaining({ taskId: "t1" })],
    });
    expect(snapshot.worktrees[1]?.jira).toMatchObject({ key: "COMP-7" });
    expect(snapshot.features).toEqual([expect.objectContaining({ id: "f1", repo: null })]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("shows one card per running daemon session inside a worktree, oldest first", async () => {
    const { board } = setup();
    const snapshot = await board.load();
    expect(snapshot.agents.map((agent) => [agent.id, agent.worktreeId, agent.state, agent.terminalHandle, agent.agentType])).toEqual([
      ["s1", "/w", "working", "s1", "claude"],
      ["s2", "/w", "blocked", "s2", "claude"],
      ["sh", "/w-child", "idle", "sh", "shell"],
    ]);
    expect(snapshot.agents[0]).toMatchObject({ prompt: "do it", session: { id: "s1", title: "Title" } });
    expect(snapshot.agents[0]?.artifacts.map((artifact) => artifact.target)).toEqual(["/w/report.md"]);
    expect(snapshot.agents[1]).toMatchObject({ session: null, lastMessage: null });
  });

  it("still shows worktrees when the daemon, bookmarks or a transcript cannot be read", async () => {
    const { board, runnerSessions, sessions, warn } = setup();
    runnerSessions.mockRejectedValueOnce(new Error("daemon down"));
    sessions.readBookmarks.mockRejectedValue(new Error("bookmarks"));
    const first = await board.load();
    expect(first.worktrees).toHaveLength(3);
    expect(first.agents).toEqual([]);

    sessions.transcriptOf.mockRejectedValue(new Error("unreadable"));
    const second = await board.load();
    expect(second.agents[0]).toMatchObject({ id: "s1", session: null, lastMessage: null });
    expect(warn.mock.calls.map(([, , context]) => context.step)).toEqual([
      "runner sessions",
      "bookmarks",
      "bookmarks",
      "transcript",
      "transcript",
    ]);
  });

  it("lists a worktree once when two registered projects share it", async () => {
    const { board } = setup({
      projects: async () => [PROJECT, { path: "/w-child", name: "child", kind: "git" }],
      worktreesOf: async () => [
        { path: "/w", branch: "feat/x", isMain: true },
        { path: "/w-child", branch: "feat/y", isMain: false },
      ],
    });
    const snapshot = await board.load();
    expect(snapshot.worktrees.map((worktree) => [worktree.path, worktree.repo])).toEqual([
      ["/w", "repo"],
      ["/w-child", "repo"],
    ]);
  });
});
