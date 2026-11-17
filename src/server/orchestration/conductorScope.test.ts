import { describe, expect, it } from "vitest";
import { conductorScope, projectOfFolder, worktreeNameFor } from "./conductorScope";

const worktrees = [
  { path: "/p/app", projectPath: "/p/app", parentWorktreeId: null, branch: "main" },
  { path: "/p/app-a", projectPath: "/p/app", parentWorktreeId: null, branch: "feat/a" },
  { path: "/p/app-a1", projectPath: "/p/app", parentWorktreeId: "/p/app-a", branch: "feat/a1" },
  { path: "/p/app-a1x", projectPath: "/p/app", parentWorktreeId: "/p/app-a1", branch: "feat/a1x" },
  { path: "/p/other", projectPath: "/p/other", parentWorktreeId: null, branch: "main" },
];

describe("conductorScope", () => {
  it("covers the whole project for a project conductor, kept as the project folder", () => {
    expect(conductorScope(worktrees, "project", "/p/app-a")).toEqual({ kind: "project", root: "/p/app", paths: [], projects: ["/p/app"] });
  });

  it("adds the other projects handed to it, ignoring folders that are not projects on the board", () => {
    expect(conductorScope(worktrees, "project", "/p/app", ["/p/other", "/p/nope"])?.projects).toEqual(["/p/app", "/p/other"]);
    expect(conductorScope(worktrees, "worktree", "/p/app-a", ["/p/other"])?.projects).toEqual(["/p/other"]);
  });

  it("gives an app conductor only the projects handed to it", () => {
    expect(conductorScope(worktrees, "app", null, ["/p/other"])).toEqual({ kind: "app", root: "/", paths: [], projects: ["/p/other"] });
  });

  it("covers the worktree and everything split off from it for a worktree conductor", () => {
    expect(conductorScope(worktrees, "worktree", "/p/app-a")?.paths).toEqual(["/p/app-a", "/p/app-a1", "/p/app-a1x"]);
  });

  it("returns null for a folder that is not on the board", () => {
    expect(conductorScope(worktrees, "project", "/nowhere")).toBeNull();
  });
});

describe("projectOfFolder", () => {
  it("finds the project of a project folder or one of its worktrees", () => {
    expect(projectOfFolder(worktrees, "/p/other/")).toBe("/p/other");
    expect(projectOfFolder(worktrees, "/p/app-a1")).toBe("/p/app");
    expect(projectOfFolder(worktrees, "/p/none")).toBeNull();
  });
});

describe("worktreeNameFor", () => {
  it("names the folder after the last part of the branch", () => {
    expect(worktreeNameFor("feat/login form")).toBe("login-form");
  });
});
