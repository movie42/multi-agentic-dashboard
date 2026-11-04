import { describe, expect, it } from "vitest";
import { findOverlaps, outputLines, overlapCandidates } from "./featureCheck";

describe("featureCheck helpers", () => {
  it("splits command output into trimmed non-empty lines", () => {
    expect(outputLines(" a\n\nb \n")).toEqual(["a", "b"]);
  });

  it("drops the root branch from overlap candidates", () => {
    const repoWorktrees = [
      { path: "/m", name: "m", branch: "develop" },
      { path: "/a", name: "a", branch: "feat/a" },
    ];
    expect(overlapCandidates({ root: "develop", repoWorktrees })).toEqual([repoWorktrees[1]]);
  });

  it("reports files changed both in a feature worktree and another worktree", () => {
    const a = { path: "/a", name: "a", branch: "feat/a" };
    const b = { path: "/b", name: "b", branch: "feat/b" };
    const c = { path: "/c", name: "c", branch: null };
    const files = new Map([
      ["/a", new Set(["x.ts", "y.ts"])],
      ["/b", new Set(["y.ts"])],
    ]);
    expect(findOverlaps([a], [a, b, c], files)).toEqual([
      { file: "y.ts", worktree: "a", otherWorktree: "b", otherBranch: "feat/b" },
    ]);
  });
});
