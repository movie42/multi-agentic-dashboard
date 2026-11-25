import { describe, expect, it } from "vitest";
import { pageWindowHref, workspaceScopeOf, workspaceWindowHref } from "./workspaceWindow";

describe("workspace window href", () => {
  it("round-trips a project and a worktree through the board URL", () => {
    const project = new URL(workspaceWindowHref("org/repo"), "http://x").searchParams;
    expect(workspaceScopeOf(project)).toEqual({ kind: "project", repo: "org/repo", worktreeId: null });
    const worktree = new URL(workspaceWindowHref("org/repo", "wt-1"), "http://x").searchParams;
    expect(workspaceScopeOf(worktree)).toEqual({ kind: "project", repo: "org/repo", worktreeId: "wt-1" });
  });

  it("round-trips a sidebar page through the board URL", () => {
    (["sessions", "todo", "diff"] as const).forEach((page) => {
      const params = new URL(pageWindowHref(page), "http://x").searchParams;
      expect(workspaceScopeOf(params)).toEqual({ kind: "page", page });
    });
  });

  it("reads no scope from the plain board URL or an unknown page", () => {
    expect(workspaceScopeOf(new URLSearchParams(""))).toBeNull();
    expect(workspaceScopeOf(new URLSearchParams("worktree=wt-1"))).toBeNull();
    expect(workspaceScopeOf(new URLSearchParams("page=nope"))).toBeNull();
    expect(workspaceScopeOf(new URLSearchParams("page=all"))).toBeNull();
  });
});
