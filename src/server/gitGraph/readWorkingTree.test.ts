import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseStatus, readWorkingDiff, readWorkingTree } from "./readWorkingTree";
import { createTestRepo, type TestRepo } from "./testRepo";

describe("parseStatus", () => {
  it("splits staged and unstaged halves, keeps rename sources and marks conflicts", () => {
    const out = ["MM both.ts", "R  new.ts", "old.ts", "?? fresh.ts", "UU clash.ts", " D gone.ts", ""].join("\0");
    expect(parseStatus(out)).toEqual([
      { path: "both.ts", from: null, state: "staged", status: "M" },
      { path: "both.ts", from: null, state: "unstaged", status: "M" },
      { path: "new.ts", from: "old.ts", state: "staged", status: "R" },
      { path: "fresh.ts", from: null, state: "untracked", status: "?" },
      { path: "clash.ts", from: null, state: "conflicted", status: "U" },
      { path: "gone.ts", from: null, state: "unstaged", status: "D" },
    ]);
  });
});

describe("readWorkingTree", () => {
  let repo: TestRepo;
  beforeEach(() => {
    repo = createTestRepo();
    repo.commit("a.txt", "first");
  });
  afterEach(() => repo.cleanup());

  it("lists edits and new files, and diffs both against HEAD", async () => {
    writeFileSync(path.join(repo.dir, "a.txt"), "changed\n");
    mkdirSync(path.join(repo.dir, "dir"));
    writeFileSync(path.join(repo.dir, "dir", "new.txt"), "hello\n");
    const tree = await readWorkingTree(repo.dir);
    expect(tree.files).toEqual([
      { path: "a.txt", from: null, state: "unstaged", status: "M" },
      { path: "dir/new.txt", from: null, state: "untracked", status: "?" },
    ]);
    expect(await readWorkingDiff(repo.dir, "a.txt")).toContain("+changed");
    expect(await readWorkingDiff(repo.dir, "dir/new.txt")).toContain("+hello");
    await expect(readWorkingDiff(repo.dir, "../outside")).rejects.toThrow("워크트리 밖");
  });
});
