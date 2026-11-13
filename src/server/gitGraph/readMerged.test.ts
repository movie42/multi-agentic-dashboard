import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCommitDiff } from "./readCommit";
import { type MergedPull, MergedReader } from "./readMerged";
import { createTestRepo, type TestRepo } from "./testRepo";

let repo: TestRepo;
const noPulls = async (): Promise<MergedPull[]> => [];

beforeEach(() => {
  repo = createTestRepo();
  repo.commit("a.txt", "first");
});

afterEach(() => repo.cleanup());

describe("readMerged", () => {
  it("finds a branch squashed onto main by its patch", async () => {
    repo.git("switch", "-q", "-c", "feat/x");
    repo.commit("x1.txt", "x one");
    repo.commit("x2.txt", "x two");
    repo.git("switch", "-q", "main");
    repo.commit("b.txt", "unrelated");
    repo.git("merge", "-q", "--squash", "feat/x");
    repo.git("commit", "-q", "-m", "squash x");
    const squash = repo.git("rev-parse", "HEAD");
    repo.git("branch", "feat/open");
    expect(await new MergedReader(noPulls).read(repo.dir)).toEqual({ "feat/x": { into: "main", sha: squash, pr: null } });
  });

  it("skips a branch with work beyond what landed", async () => {
    repo.git("switch", "-q", "-c", "feat/y");
    repo.commit("y.txt", "y");
    repo.git("switch", "-q", "main");
    repo.git("merge", "-q", "--squash", "feat/y");
    repo.git("commit", "-q", "-m", "squash y");
    repo.git("switch", "-q", "feat/y");
    repo.commit("y2.txt", "more y");
    expect(await new MergedReader(noPulls).read(repo.dir)).toEqual({});
  });

  it("takes a merged PR whose head is the branch tip", async () => {
    repo.git("switch", "-q", "-c", "feat/z");
    const tip = repo.commit("z.txt", "z");
    repo.git("switch", "-q", "main");
    const pulls = async (): Promise<MergedPull[]> => [
      { number: 7, headRefName: "feat/z", headRefOid: tip, baseRefName: "develop", mergeSha: "0".repeat(40) },
    ];
    expect(await new MergedReader(pulls).read(repo.dir)).toEqual({ "feat/z": { into: "develop", sha: null, pr: 7 } });
  });
});

describe("readCommitDiff", () => {
  it("returns one file's patch", async () => {
    const sha = repo.commit("a.txt", "changed");
    const diff = await readCommitDiff(repo.dir, sha, "a.txt", null);
    expect(diff).toContain("-first");
    expect(diff).toContain("+changed");
  });
});
