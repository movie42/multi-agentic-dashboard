import { describe, expect, it, vi } from "vitest";
import type { RunnerSession } from "@/common/runner/types";
import { runnerSession } from "@/server/board/boardFixtures";
import { answerWorktreeRequest, launchConductor, type ConductorActionDeps } from "./conductorActions";

const worktree = (path: string, parent: string | null = null) => ({
  worktreeId: path,
  repo: "app",
  name: path,
  branch: path === "/p/app" ? "main" : "feat/a",
  path,
  projectPath: "/p/app",
  isMain: path === "/p/app",
  parentWorktreeId: parent,
  unread: false,
  lastActivityAt: null,
  flowTasks: [],
  otherFlowTasks: [],
  pullRequest: null,
  jira: null,
  featureId: null,
});

function setup(sessions: RunnerSession[] = []) {
  const runner = {
    list: vi.fn(async () => sessions),
    launch: vi.fn(async () => runnerSession()),
    settleWorktreeRequest: vi.fn(async () => {}),
  };
  const createWorktree = vi.fn(async () => ({ path: "/p/app-split", name: "split" }));
  const deps = {
    worktrees: async () => [worktree("/p/app"), worktree("/p/app-a"), worktree("/p/app-a1", "/p/app-a")],
    runner,
    createWorktree,
  } as unknown as ConductorActionDeps;
  return { deps, runner, createWorktree };
}

const conductorSession = (worktreeRequest: { id: string; branch: string; base: string | null } | null) =>
  runnerSession({
    id: "c",
    cwd: "/p/app-a",
    orchestration: {
      parentId: null,
      links: [],
      conductor: {
        scope: { kind: "worktree", root: "/p/app-a", paths: ["/p/app-a", "/p/app-a1"] },
        grants: [],
        rules: [],
        worktreeRequest: worktreeRequest ? { ...worktreeRequest, reason: "r", prompt: null, requestedAt: 1 } : null,
      },
    },
  });

describe("launchConductor", () => {
  it("launches with the scope computed from the board", async () => {
    const { deps, runner } = setup();
    await launchConductor(deps, { worktreePath: "/p/app-a", prompt: " plan ", scope: "worktree", grants: ["edit"] });
    expect(runner.launch).toHaveBeenCalledWith({
      cwd: "/p/app-a",
      prompt: "plan",
      conductor: { scope: { kind: "worktree", root: "/p/app-a", paths: ["/p/app-a", "/p/app-a1"] }, grants: ["edit"] },
    });
  });
});

describe("answerWorktreeRequest", () => {
  it("creates the worktree under the conductor's worktree and reports the folder", async () => {
    const { deps, runner, createWorktree } = setup([conductorSession({ id: "w1", branch: "feat/split", base: null })]);
    await answerWorktreeRequest(deps, "c", "w1", true);
    expect(createWorktree).toHaveBeenCalledWith(expect.objectContaining({ projectPath: "/p/app", branch: "feat/split", baseBranch: "feat/a", parentPath: "/p/app-a", name: "split" }));
    expect(runner.settleWorktreeRequest).toHaveBeenCalledWith("c", "w1", { path: "/p/app-split" });
  });

  it("settles without a folder when the person declines", async () => {
    const { deps, runner, createWorktree } = setup([conductorSession({ id: "w1", branch: "feat/split", base: null })]);
    await answerWorktreeRequest(deps, "c", "w1", false);
    expect(createWorktree).not.toHaveBeenCalled();
    expect(runner.settleWorktreeRequest).toHaveBeenCalledWith("c", "w1", {});
  });

  it("tells the conductor when creating fails", async () => {
    const { deps, runner, createWorktree } = setup([conductorSession({ id: "w1", branch: "feat/split", base: "develop" })]);
    createWorktree.mockRejectedValueOnce(new Error("branch exists"));
    await expect(answerWorktreeRequest(deps, "c", "w1", true)).rejects.toThrow("branch exists");
    expect(runner.settleWorktreeRequest).toHaveBeenCalledWith("c", "w1", { error: "branch exists" });
  });

  it("refuses a request that is no longer pending", async () => {
    const { deps } = setup([conductorSession(null)]);
    await expect(answerWorktreeRequest(deps, "c", "w1", true)).rejects.toThrow("이미 처리한");
  });
});
