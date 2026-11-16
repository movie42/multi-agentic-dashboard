import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestRepo, type TestRepo } from "@/server/gitGraph/testRepo";
import { changedFiles, pairOverlaps, readOverlaps } from "./overlaps";

describe("pairOverlaps", () => {
  it("pairs worktrees that share files and skips the rest", () => {
    expect(
      pairOverlaps([
        { path: "/a", files: ["src/x.ts", "src/y.ts"] },
        { path: "/b", files: ["src/y.ts", "src/x.ts", "README.md"] },
        { path: "/c", files: ["src/z.ts"] },
      ]),
    ).toEqual([{ a: "/a", b: "/b", files: ["src/x.ts", "src/y.ts"] }]);
  });
});

describe("readOverlaps", () => {
  it("treats a worktree that cannot be read as having no changes", async () => {
    const warned: string[] = [];
    const overlaps = await readOverlaps(
      ["/a", "/broken", "/b"],
      async (worktreePath) => {
        if (worktreePath === "/broken") throw new Error("not a repo");
        return ["shared.ts"];
      },
      (_error, worktreePath) => warned.push(worktreePath),
    );
    expect(overlaps).toEqual([{ a: "/a", b: "/b", files: ["shared.ts"] }]);
    expect(warned).toEqual(["/broken"]);
  });
});

describe("changedFiles", () => {
  let repo: TestRepo | null = null;
  afterEach(() => repo?.cleanup());

  it("lists committed, uncommitted and untracked changes since the fork from main", () => {
    repo = createTestRepo();
    repo.commit("base.txt", "base");
    const feature = path.join(path.dirname(repo.dir), "feature");
    repo.git("worktree", "add", "-q", "-b", "feat/x", feature);
    const run = (file: string, text: string) => writeFileSync(path.join(feature, file), text);
    run("committed.txt", "c\n");
    repo.git("-C", feature, "add", "committed.txt");
    repo.git("-C", feature, "commit", "-q", "-m", "committed");
    run("base.txt", "edited\n");
    run("new.txt", "n\n");
    return expect(changedFiles(feature).then((files) => [...files].sort())).resolves.toEqual(["base.txt", "committed.txt", "new.txt"]);
  });
});
