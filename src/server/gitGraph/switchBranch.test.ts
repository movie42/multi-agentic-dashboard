import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCommit } from "./readCommit";
import { readGraph } from "./readGraph";
import { switchBranch } from "./switchBranch";
import { createTestRepo, type TestRepo } from "./testRepo";

let repo: TestRepo;
let root = "";

beforeEach(() => {
  repo = createTestRepo();
  root = repo.commit("a.txt", "first");
  repo.git("branch", "feature");
  repo.commit("b.txt", "second");
});

afterEach(() => repo.cleanup());

describe("readGraph", () => {
  it("lists commits newest first with refs, pages and the checked-out branch", async () => {
    const graph = await readGraph(repo.dir, 0, 1);
    expect(graph.currentBranch).toBe("main");
    expect(graph.commits.map((commit) => commit.subject)).toEqual(["second"]);
    expect(graph.commits[0]?.refs).toEqual([{ kind: "branch", name: "main", current: true }]);
    expect(graph.hasMore).toBe(true);
    expect(graph.checkedOut).toEqual({ main: repo.dir });
    expect(graph.worktrees).toEqual([{ path: repo.dir, branch: "main", headSha: graph.headSha }]);
    const next = await readGraph(repo.dir, 1, 1);
    expect(next.commits[0]?.refs).toEqual([{ kind: "branch", name: "feature", current: false }]);
    expect(next.hasMore).toBe(false);
  });

  it("reads one commit's files", async () => {
    const detail = await readCommit(repo.dir, root);
    expect(detail.message).toBe("first");
    expect(detail.files).toEqual([{ status: "A", path: "a.txt", from: null }]);
  });
});

describe("switchBranch", () => {
  it("switches to a local branch and creates a branch from a commit", async () => {
    await expect(switchBranch({ kind: "local", worktreePath: repo.dir, branch: "feature" })).resolves.toBe("feature");
    expect(repo.git("symbolic-ref", "--short", "HEAD")).toBe("feature");
    await expect(switchBranch({ kind: "new", worktreePath: repo.dir, name: "fix/one", from: root })).resolves.toBe("fix/one");
    expect(repo.git("rev-parse", "HEAD")).toBe(root);
  });

  it("refuses while tracked files have uncommitted changes", async () => {
    writeFileSync(path.join(repo.dir, "b.txt"), "changed\n");
    await expect(switchBranch({ kind: "local", worktreePath: repo.dir, branch: "feature" })).rejects.toThrow("커밋 안 한 변경이 1개");
    expect(repo.git("symbolic-ref", "--short", "HEAD")).toBe("main");
  });

  it("refuses a branch another worktree has checked out", async () => {
    repo.git("worktree", "add", "-q", path.join(path.dirname(repo.dir), "other"), "feature");
    await expect(switchBranch({ kind: "local", worktreePath: repo.dir, branch: "feature" })).rejects.toThrow("다른 워크트리");
  });

  it("refuses an invalid or existing branch name", async () => {
    await expect(switchBranch({ kind: "new", worktreePath: repo.dir, name: "bad..name", from: root })).rejects.toThrow("쓸 수 없어요");
    await expect(switchBranch({ kind: "new", worktreePath: repo.dir, name: "feature", from: root })).rejects.toThrow("이미 있어요");
  });

  it("creates a tracking branch from a remote branch", async () => {
    repo.git("branch", "remote-only", root);
    repo.git("remote", "add", "origin", repo.dir);
    repo.git("fetch", "-q", "origin");
    repo.git("branch", "-D", "remote-only");
    await expect(switchBranch({ kind: "remote", worktreePath: repo.dir, remoteBranch: "origin/remote-only" })).resolves.toBe("remote-only");
    expect(repo.git("rev-parse", "HEAD")).toBe(root);
  });
});
