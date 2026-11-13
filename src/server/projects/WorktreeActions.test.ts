import { describe, expect, it, vi } from "vitest";
import { execError, fakeExecFile } from "@/server/shared/fakes";
import { WorktreeActions, worktreePathFor } from "./WorktreeActions";

const session = (id: string, cwd: string) => ({ id, cwd, kind: "claude" as const, status: "idle" as const, prompted: false, startedAt: 1, updatedAt: 1, exitCode: null, model: null, contextPercent: null, permission: null });

function setup(handler: Parameters<typeof fakeExecFile>[0] = () => "") {
  const execFile = fakeExecFile(handler);
  const meta = { patch: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
  const runner = {
    list: vi.fn(async () => [session("in", "/p/app-x/src"), session("out", "/p/app-xy")]),
    launch: vi.fn(async () => session("new", "/p/app-x")),
    close: vi.fn(async () => {}),
  };
  const warn = vi.fn();
  const actions = new WorktreeActions({
    execFile,
    projects: async () => [
      { path: "/p/app", name: "app", kind: "git" },
      { path: "/p/notes", name: "notes", kind: "folder" },
    ],
    worktreesOf: async (project) =>
      project.kind === "git"
        ? [
            { path: "/p/app", branch: "main", isMain: true },
            { path: "/p/app-x", branch: "feat/x", isMain: false },
          ]
        : [{ path: "/p/notes", branch: null, isMain: true }],
    meta,
    runner,
    warn,
  });
  return { actions, execFile, meta, runner, warn };
}

const plan = { projectPath: "/p/app", name: "x", branch: "feat/x", baseBranch: "develop", parentPath: "/p/app", reference: "COMP-1", prompt: " start " };

describe("WorktreeActions.create", () => {
  it("puts the worktree next to the project folder", () => {
    expect(worktreePathFor("/p/app", "x")).toBe("/p/app-x");
  });

  it("adds a git worktree on a new branch, records what git does not, and starts the agent with the first request", async () => {
    const { actions, execFile, meta, runner } = setup(({ args }) =>
      args.includes("rev-parse") && args.at(-1) === "refs/heads/develop" ? execError("no ref", { code: 1 }) : "",
    );
    expect(await actions.create(plan)).toEqual({ path: "/p/app-x", name: "x" });
    expect(execFile.calls.at(-1)?.args).toEqual(["-C", "/p/app", "worktree", "add", "--no-track", "-b", "feat/x", "/p/app-x", "origin/develop"]);
    expect(meta.patch).toHaveBeenCalledWith("/p/app-x", { displayName: "x", parentPath: "/p/app", reference: "COMP-1" });
    expect(runner.launch).toHaveBeenCalledWith({ cwd: "/p/app-x", prompt: "start" });
  });

  it("starts no agent without a first request, and uses a local base branch as is", async () => {
    const { actions, execFile, runner } = setup();
    await actions.create({ ...plan, prompt: "  ", parentPath: null, reference: null });
    expect(execFile.calls.at(-1)?.args.at(-1)).toBe("develop");
    expect(runner.launch).not.toHaveBeenCalled();
  });

  it("refuses a project that is not registered or not a git repository", async () => {
    const { actions } = setup();
    await expect(actions.create({ ...plan, projectPath: "/elsewhere" })).rejects.toThrow("프로젝트를 찾지 못했어요");
    await expect(actions.create({ ...plan, projectPath: "/p/notes" })).rejects.toThrow("git 저장소가 아닌");
  });

  it("keeps the created worktree and reports a first request that could not start", async () => {
    const { actions, runner, warn } = setup();
    runner.launch.mockRejectedValueOnce(new Error("세션 러너 데몬을 띄우지 못했어요."));
    expect(await actions.create(plan)).toEqual({ path: "/p/app-x", name: "x", launchError: "세션 러너 데몬을 띄우지 못했어요." });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("reports git's own message when the worktree cannot be added", async () => {
    const { actions, meta } = setup(({ args }) =>
      args.includes("add") ? execError("failed", { stderr: "Preparing worktree\nfatal: a branch named 'feat/x' already exists" }) : "",
    );
    await expect(actions.create(plan)).rejects.toThrow("fatal: a branch named 'feat/x' already exists");
    expect(meta.patch).not.toHaveBeenCalled();
  });
});

describe("WorktreeActions.remove", () => {
  it("closes the sessions inside the worktree, removes it with git, and forgets its record", async () => {
    const { actions, execFile, meta, runner } = setup();
    await actions.remove("/p/app-x", true);
    expect(runner.close.mock.calls).toEqual([["in"]]);
    expect(execFile.calls.at(-1)?.args).toEqual(["-C", "/p/app", "worktree", "remove", "--force", "/p/app-x"]);
    expect(meta.remove).toHaveBeenCalledWith("/p/app-x");
  });

  it("never removes a project's original folder", async () => {
    const { actions, execFile } = setup();
    await expect(actions.remove("/p/app", true)).rejects.toThrow("원래 폴더는 지울 수 없어요");
    await expect(actions.remove("/p/unknown", false)).rejects.toThrow("워크트리를 찾지 못했어요");
    expect(execFile.calls).toEqual([]);
  });

  it("keeps the record and the sessions when git refuses, for example because of uncommitted changes", async () => {
    const { actions, meta, runner } = setup(() => execError("failed", { stderr: "fatal: '/p/app-x' contains modified or untracked files, use --force to delete it" }));
    await expect(actions.remove("/p/app-x", false)).rejects.toThrow("use --force");
    expect(meta.remove).not.toHaveBeenCalled();
    expect(runner.close).not.toHaveBeenCalled();
  });
});

describe("WorktreeActions.rename", () => {
  it("only changes the name this app shows", async () => {
    const { actions, execFile, meta } = setup();
    await actions.rename("/p/app-x", " New name ");
    expect(meta.patch).toHaveBeenCalledWith("/p/app-x", { displayName: "New name" });
    expect(execFile.calls).toEqual([]);
  });
});
