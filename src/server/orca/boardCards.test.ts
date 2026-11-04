import { describe, expect, it } from "vitest";
import type { BoardSnapshot } from "@/common/orca/types";
import type { FeatureSummary } from "@/common/workflow/types";
import { rawAgent, rawWorktree } from "./boardFixtures";
import {
  buildAgentCard,
  buildWorktreeSummary,
  effectiveAgent,
  expandPreview,
  featureCheckInputOf,
  repoPaths,
  shortBranch,
  terminalHandles,
  toAgentState,
  withFeatureRepos,
} from "./boardCards";

function feature(overrides: Partial<FeatureSummary> = {}): FeatureSummary {
  return {
    id: "f1",
    title: "f",
    root: "develop",
    docPath: "/doc",
    repo: "repo",
    pageIndex: null,
    repoPath: null,
    rows: [],
    sharedWaits: [],
    check: { kind: "idle" },
    ...overrides,
  };
}

describe("board card helpers", () => {
  it("expands a one-line preview only when the full message starts with it", () => {
    expect(expandPreview("Hello  world", "Hello world\nmore")).toBe("Hello world\nmore");
    expect(expandPreview("Other", "Hello world")).toBe("Other");
    expect(expandPreview("two\nlines", "two\nlines and more")).toBe("two\nlines");
    expect(expandPreview(null, "x")).toBeNull();
  });

  it("normalises states and branches", () => {
    expect(toAgentState("blocked")).toBe("blocked");
    expect(toAgentState("weird")).toBe("idle");
    expect(shortBranch("refs/heads/feat/x")).toBe("feat/x");
    expect(shortBranch(null)).toBeNull();
  });

  it("indexes terminals by tab:leaf, then by recorded pane key when not taken", () => {
    const base = { worktreeId: "w", title: null, connected: true };
    const handles = terminalHandles([
      { ...base, handle: "h1", tabId: "t1", leafId: "l1", recordedPaneKey: "old:pane" },
      { ...base, handle: "h2", tabId: "t2", leafId: "l2", recordedPaneKey: "t1:l1" },
      { ...base, handle: "h3", tabId: "t3", leafId: "l3", recordedPaneKey: "old:pane" },
    ]);
    expect(Object.fromEntries(handles)).toEqual({ "t1:l1": "h1", "t2:l2": "h2", "t3:l3": "h3", "old:pane": "h1" });
  });

  it("uses the main worktree path for a repo, otherwise the first", () => {
    const paths = repoPaths([
      rawWorktree({ path: "/a" }),
      rawWorktree({ path: "/main", isMainWorktree: true }),
      rawWorktree({ path: "/c" }),
      rawWorktree({ repo: "other", path: "/o" }),
    ]);
    expect(Object.fromEntries(paths)).toEqual({ repo: "/main", other: "/o" });
  });

  it("shows the main agent's state while a background monitor runs", () => {
    const monitor = rawAgent({
      state: "working",
      workingMode: "monitoring",
      mainAgent: { state: "waiting", stateStartedAt: 99 },
    });
    expect(effectiveAgent(monitor)).toEqual({ backgroundRunning: true, state: "waiting", since: 99 });
    expect(effectiveAgent(rawAgent())).toEqual({ backgroundRunning: false, state: "working", since: 10 });
  });

  it("builds worktree summaries and agent cards from raw orca data", () => {
    const worktree = rawWorktree({ parentWorktreeId: "archived" });
    const summary = buildWorktreeSummary({
      worktree,
      liveIds: new Set(["wt-1"]),
      flow: { current: [], other: [] },
      pullRequest: { kind: "loading" },
    });
    expect(summary).toMatchObject({ name: "feat/x", branch: "feat/x", parentWorktreeId: null, featureId: null });
    const card = buildAgentCard({
      agent: rawAgent({ parentPaneKey: "p" }),
      worktree,
      lastMessage: "hi",
      session: { id: "s1", title: "T", titleSource: "custom", bookmark: null },
      bookmarks: new Map([["s1", { name: "b", memo: "", createdAt: "x", lastOpenedAt: null }]]),
      terminalHandle: "h",
      artifacts: [],
      permission: null,
    });
    expect(card).toMatchObject({
      id: "tab:leaf",
      worktreeName: "feat/x",
      title: "Claude",
      state: "working",
      lastMessage: "hi",
      terminalHandle: "h",
      parentId: "p",
      session: { id: "s1", bookmark: { name: "b" } },
    });
  });

  it("assigns a feature's repo from its repo path or row worktrees without mutating", () => {
    const original = feature({ repo: null, rows: [{ id: "r", title: "", issue: null, branch: null, worktree: "/w2", jiraStatus: null, jiraTodo: null }] });
    const [assigned] = withFeatureRepos([original], new Map([["/w2", "repo-b"]]));
    expect(assigned?.repo).toBe("repo-b");
    expect(original.repo).toBeNull();
  });
});

describe("featureCheckInputOf", () => {
  const worktree = (path: string, featureId: string | null, repo = "repo") => ({
    ...buildWorktreeSummary({
      worktree: rawWorktree({ path, repo }),
      liveIds: new Set(),
      flow: { current: [], other: [] },
      pullRequest: { kind: "loading" },
    }),
    featureId,
  });

  it("collects repo and feature worktrees", () => {
    const board: Pick<BoardSnapshot, "features" | "worktrees"> = {
      features: [feature()],
      worktrees: [worktree("/a", "f1"), worktree("/b", null), worktree("/c", null, "other")],
    };
    expect(featureCheckInputOf(board, "f1")).toEqual({
      featureId: "f1",
      root: "develop",
      repoPath: "/a",
      featureWorktrees: [{ path: "/a", name: "feat/x", branch: "feat/x" }],
      repoWorktrees: [
        { path: "/a", name: "feat/x", branch: "feat/x" },
        { path: "/b", name: "feat/x", branch: "feat/x" },
      ],
    });
  });

  it("explains what is missing", () => {
    expect(() => featureCheckInputOf({ features: [], worktrees: [] }, "f1")).toThrow("기능 문서를 찾지 못했어요");
    expect(() => featureCheckInputOf({ features: [feature({ root: null })], worktrees: [] }, "f1")).toThrow(/root/);
    expect(() => featureCheckInputOf({ features: [feature()], worktrees: [] }, "f1")).toThrow("기능의 워크트리를 찾지 못했어요");
  });
});
