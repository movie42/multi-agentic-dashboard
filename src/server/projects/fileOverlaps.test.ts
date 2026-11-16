import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestRepo, type TestRepo } from "@/server/gitGraph/testRepo";
import { changedFiles, pairOverlaps, readFileOverlaps } from "./fileOverlaps";

describe("pairOverlaps", () => {
  it("pairs worktrees that changed the same file and skips the rest", () => {
    expect(
      pairOverlaps([
        ["/a", ["x.ts", "y.ts"]],
        ["/b", ["y.ts"]],
        ["/c", ["z.ts"]],
      ]),
    ).toEqual([{ a: "/a", b: "/b", files: ["y.ts"] }]);
  });
});

describe("changedFiles", () => {
  const repos: TestRepo[] = [];
  afterEach(() => repos.splice(0).forEach((repo) => repo.cleanup()));

  it("counts commits since the fork, uncommitted edits and new files", async () => {
    const repo = createTestRepo();
    repos.push(repo);
    repo.commit("base.ts", "base");
    repo.commit("shared.ts", "shared");
    const worktree = path.join(path.dirname(repo.dir), "feat");
    repo.git("worktree", "add", "-q", "-b", "feat/a", worktree);
    writeFileSync(path.join(worktree, "committed.ts"), "x\n");
    repo.git("-C", worktree, "add", "committed.ts");
    repo.git("-C", worktree, "commit", "-q", "-m", "work");
    writeFileSync(path.join(worktree, "shared.ts"), "edited\n");
    writeFileSync(path.join(worktree, "new.ts"), "new\n");
    expect(await changedFiles(worktree)).toEqual(["committed.ts", "new.ts", "shared.ts"]);
  });

  it("drops a folder git cannot read", async () => {
    const warnings: unknown[] = [];
    expect(await readFileOverlaps(["/definitely/not/here"], (_scope, error) => warnings.push(error))).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
