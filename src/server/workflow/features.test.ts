import { describe, expect, it, vi } from "vitest";
import type { FeatureSummary } from "@/common/workflow/types";
import { featureOfWorktree, sharedWaits, toFeatureRow } from "./features";

function feature(overrides: Partial<FeatureSummary>): FeatureSummary {
  return {
    id: "f",
    title: "f",
    root: null,
    docPath: "/doc/f.json",
    repo: null,
    pageIndex: null,
    repoPath: null,
    rows: [],
    sharedWaits: [],
    ...overrides,
  };
}

describe("toFeatureRow", () => {
  it("fills ids from issue or position", () => {
    expect(toFeatureRow({ issue: "PROJ-1" }, 0)).toMatchObject({ id: "PROJ-1", title: "", issue: "PROJ-1" });
    expect(toFeatureRow({ jira: { status: "Done" } }, 2)).toMatchObject({ id: "row-3", jiraStatus: "Done" });
  });
});

describe("sharedWaits", () => {
  const rows = [toFeatureRow({ id: "r1", branch: "feat/a", worktree: "/wa" }, 0)];

  it("marks unresolved owners and skips merged or not-applicable pull requests", () => {
    const pullRequestOf = vi.fn((_where: string, branch: string) =>
      branch === "feat/a"
        ? ({ kind: "found", number: 1, state: "MERGED", isDraft: false, url: "u" } as const)
        : ({ kind: "loading" } as const),
    );
    const waits = sharedWaits(
      [
        { item: "button", buildIn: "r1", usedBy: "r2" },
        { item: "modal", buildIn: "feat/b", usedBy: ["r1"] },
        { buildIn: "nobody" },
      ],
      rows,
      "/repo",
      pullRequestOf,
    );
    expect(waits).toEqual([
      { item: "modal", usedBy: ["r1"], reason: { kind: "pr", pullRequest: { kind: "loading" }, branch: "feat/b" } },
      { item: "nobody", usedBy: [], reason: { kind: "unresolved", buildIn: "nobody" } },
    ]);
    expect(pullRequestOf).toHaveBeenCalledWith("/wa", "feat/a");
    expect(pullRequestOf).toHaveBeenCalledWith("/repo", "feat/b");
  });
});

describe("featureOfWorktree", () => {
  it("matches by row worktree or branch first, then by task pointers, within the repo", () => {
    const byRow = feature({ id: "row", rows: [toFeatureRow({ branch: "feat/a" }, 0)] });
    const byDoc = feature({ id: "doc", docPath: "/doc/x.json" });
    const otherRepo = feature({ id: "other", repo: "elsewhere", rows: [toFeatureRow({ branch: "feat/a" }, 0)] });
    expect(featureOfWorktree([otherRepo, byDoc, byRow], "repo", "/w", "feat/a", [])?.id).toBe("row");
    expect(featureOfWorktree([byDoc], "repo", "/w", "feat/z", ["/doc/x.json"])?.id).toBe("doc");
    expect(featureOfWorktree([byDoc], "repo", "/w", "feat/z", [])).toBeNull();
  });
});
