import { describe, expect, it, vi } from "vitest";
import type { RunnerSession } from "@/common/runner/types";
import { runnerSession } from "@/server/board/boardFixtures";
import { answerProjectRequest, answerWorktreeRequest, launchConductor, type ConductorActionDeps } from "./conductorActions";

const worktree = (path: string, parent: string | null = null, projectPath = "/p/app") => ({
  worktreeId: path,
  repo: projectPath.slice(3),
  name: path,
  branch: path === projectPath ? "main" : "feat/a",
  path,
  projectPath,
  isMain: path === projectPath,
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
    settleProjectRequest: vi.fn(async () => {}),
  };
  const createWorktree = vi.fn(async () => ({ path: "/p/app-split", name: "split" }));
  const deps = {
    worktrees: async () => [worktree("/p/app"), worktree("/p/app-a"), worktree("/p/app-a1", "/p/app-a"), worktree("/p/web", null, "/p/web")],
    runner,
    createWorktree,
  } as unknown as ConductorActionDeps;
  return { deps, runner, createWorktree };
}

type PendingWorktree = { id: string; branch: string; base: string | null; project?: string | null };

const conductorSession = (worktreeRequest: PendingWorktree | null, projectRequest: { id: string; path: string } | null = null, cwd = "/p/app-a") =>
  runnerSession({
    id: "c",
    cwd,
    orchestration: {
      parentId: null,
      links: [],
      conductor: {
        scope: { kind: "worktree", root: "/p/app-a", paths: ["/p/app-a", "/p/app-a1"], projects: [] },
        knownProjects: [],
        worktreeRequest: worktreeRequest ? { project: null, ...worktreeRequest, reason: "r", prompt: null, requestedAt: 1 } : null,
        projectRequest: projectRequest ? { ...projectRequest, reason: "r", requestedAt: 1 } : null,
      },
    },
  });

describe("launchConductor", () => {
  it("launches with the scope computed from the board", async () => {
    const { deps, runner } = setup();
    await launchConductor(deps, { worktreePath: "/p/app-a", prompt: " plan ", scope: "worktree", projects: ["/p/web", "/p/unknown"] });
    expect(runner.launch).toHaveBeenCalledWith({
      cwd: "/p/app-a",
      prompt: "plan",
      conductor: {
        scope: { kind: "worktree", root: "/p/app-a", paths: ["/p/app-a", "/p/app-a1"], projects: ["/p/web"] },
        knownProjects: ["/p/app", "/p/web"],
      },
    });
  });

  it("keeps a project conductor's scope as projects, so later worktrees count", async () => {
    const { deps, runner } = setup();
    await launchConductor(deps, { worktreePath: "/p/app", prompt: "", scope: "project", projects: ["/p/web"] });
    expect(runner.launch).toHaveBeenCalledWith(expect.objectContaining({ conductor: expect.objectContaining({ scope: { kind: "project", root: "/p/app", paths: [], projects: ["/p/app", "/p/web"] } }) }));
  });

  it("launches an app conductor with the chosen projects and refuses one with none", async () => {
    const { deps, runner } = setup();
    await launchConductor(deps, { worktreePath: null, prompt: "", scope: "app", projects: ["/p/web"] });
    expect(runner.launch).toHaveBeenCalledWith(expect.objectContaining({ conductor: expect.objectContaining({ scope: { kind: "app", root: "/", paths: [], projects: ["/p/web"] } }) }));
    await expect(launchConductor(deps, { worktreePath: null, prompt: "", scope: "app", projects: [] })).rejects.toThrow("프로젝트");
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

  it("makes the worktree in the project the request names, off that project's main branch", async () => {
    const { deps, createWorktree } = setup([conductorSession({ id: "w1", branch: "feat/web", base: null, project: "/p/web" })]);
    await answerWorktreeRequest(deps, "c", "w1", true);
    expect(createWorktree).toHaveBeenCalledWith(expect.objectContaining({ projectPath: "/p/web", baseBranch: "main", parentPath: null }));
  });

  it("refuses a request that is no longer pending", async () => {
    const { deps } = setup([conductorSession(null)]);
    await expect(answerWorktreeRequest(deps, "c", "w1", true)).rejects.toThrow("이미 처리한");
  });
});

describe("answerProjectRequest", () => {
  it("allows a project on the board, named by any of its folders", async () => {
    const { deps, runner } = setup([conductorSession(null, { id: "p1", path: "/p/web/" })]);
    await answerProjectRequest(deps, "c", "p1", true);
    expect(runner.settleProjectRequest).toHaveBeenCalledWith("c", "p1", { path: "/p/web" });
  });

  it("refuses a folder that is not a project on the board", async () => {
    const { deps, runner } = setup([conductorSession(null, { id: "p1", path: "/elsewhere" })]);
    await expect(answerProjectRequest(deps, "c", "p1", true)).rejects.toThrow("등록된 프로젝트");
    expect(runner.settleProjectRequest).toHaveBeenCalledWith("c", "p1", { error: expect.stringContaining("등록된 프로젝트") });
  });

  it("settles without a folder when the person declines", async () => {
    const { deps, runner } = setup([conductorSession(null, { id: "p1", path: "/p/web" })]);
    await answerProjectRequest(deps, "c", "p1", false);
    expect(runner.settleProjectRequest).toHaveBeenCalledWith("c", "p1", {});
  });
});
