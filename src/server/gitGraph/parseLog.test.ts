import { describe, expect, it } from "vitest";
import { FIELD, parseLog, parseRefs, RECORD } from "./parseLog";
import { parseNameStatus } from "./readCommit";
import { parseWorktreeList } from "./git";

describe("parseRefs", () => {
  it("separates the current branch, slashed local branches, remotes and tags", () => {
    expect(
      parseRefs("HEAD -> refs/heads/feat/x, refs/heads/main, refs/remotes/origin/feat/x, refs/remotes/origin/HEAD, tag: refs/tags/v1"),
    ).toEqual([
      { kind: "branch", name: "feat/x", current: true },
      { kind: "branch", name: "main", current: false },
      { kind: "remote", name: "origin/feat/x", current: false },
      { kind: "tag", name: "v1", current: false },
    ]);
  });

  it("marks a detached HEAD", () => {
    expect(parseRefs("HEAD")).toEqual([{ kind: "head", name: "HEAD", current: true }]);
  });
});

describe("parseLog", () => {
  it("reads merge parents, root commits and subjects", () => {
    const record = (fields: string[]) => `${fields.join(FIELD)}${RECORD}\n`;
    const out = record(["m", "a b", "Kim", "10", "", "Merge"]) + record(["a", "", "Lee", "5", "refs/heads/main", "root"]);
    expect(parseLog(out)).toEqual([
      { sha: "m", parents: ["a", "b"], author: "Kim", time: 10_000, subject: "Merge", refs: [] },
      { sha: "a", parents: [], author: "Lee", time: 5_000, subject: "root", refs: [{ kind: "branch", name: "main", current: false }] },
    ]);
  });
});

describe("parseNameStatus", () => {
  it("keeps both paths of a rename", () => {
    expect(parseNameStatus("M\ta.ts\nR087\told.ts\tnew.ts\nD\tgone.ts\n")).toEqual([
      { status: "M", path: "a.ts", from: null },
      { status: "R", path: "new.ts", from: "old.ts" },
      { status: "D", path: "gone.ts", from: null },
    ]);
  });
});

describe("parseWorktreeList", () => {
  it("maps each checked-out branch to its worktree", () => {
    const out = "worktree /r/main\nHEAD abc\nbranch refs/heads/main\n\nworktree /r/wt\nHEAD def\ndetached\n\nworktree /r/f\nHEAD 123\nbranch refs/heads/feat/y\n";
    expect(parseWorktreeList(out)).toEqual({ main: "/r/main", "feat/y": "/r/f" });
  });
});
