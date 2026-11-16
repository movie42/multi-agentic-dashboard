import { describe, expect, it } from "vitest";
import { conductorScope, worktreeNameFor } from "./conductorScope";

const worktrees = [
  { path: "/p/app", projectPath: "/p/app", parentWorktreeId: null, branch: "main" },
  { path: "/p/app-a", projectPath: "/p/app", parentWorktreeId: null, branch: "feat/a" },
  { path: "/p/app-a1", projectPath: "/p/app", parentWorktreeId: "/p/app-a", branch: "feat/a1" },
  { path: "/p/app-a1x", projectPath: "/p/app", parentWorktreeId: "/p/app-a1", branch: "feat/a1x" },
  { path: "/p/other", projectPath: "/p/other", parentWorktreeId: null, branch: "main" },
];

describe("conductorScope", () => {
  it("covers every worktree of the project for a project conductor", () => {
    expect(conductorScope(worktrees, "project", "/p/app-a")).toEqual({ kind: "project", root: "/p/app", paths: ["/p/app", "/p/app-a", "/p/app-a1", "/p/app-a1x"] });
  });

  it("covers the worktree and everything split off from it for a worktree conductor", () => {
    expect(conductorScope(worktrees, "worktree", "/p/app-a")?.paths).toEqual(["/p/app-a", "/p/app-a1", "/p/app-a1x"]);
  });

  it("returns null for a folder that is not on the board", () => {
    expect(conductorScope(worktrees, "project", "/nowhere")).toBeNull();
  });
});

describe("worktreeNameFor", () => {
  it("names the folder after the last part of the branch", () => {
    expect(worktreeNameFor("feat/login form")).toBe("login-form");
  });
});
