import { describe, expect, it } from "vitest";
import { workspaceScopeOf, workspaceWindowHref } from "./workspaceWindow";

describe("workspace window href", () => {
  it("round-trips a project and a worktree through the board URL", () => {
    const project = new URL(workspaceWindowHref("org/repo"), "http://x").searchParams;
    expect(workspaceScopeOf(project)).toEqual({ repo: "org/repo", worktreeId: null });
    const worktree = new URL(workspaceWindowHref("org/repo", "wt-1"), "http://x").searchParams;
    expect(workspaceScopeOf(worktree)).toEqual({ repo: "org/repo", worktreeId: "wt-1" });
  });

  it("reads no scope from the plain board URL", () => {
    expect(workspaceScopeOf(new URLSearchParams(""))).toBeNull();
    expect(workspaceScopeOf(new URLSearchParams("worktree=wt-1"))).toBeNull();
  });
});
