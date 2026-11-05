import { describe, expect, it, vi } from "vitest";
import { execError, fakeExecFile } from "@/server/shared/fakes";
import { FeatureCheckRunner } from "./FeatureCheckRunner";

const input = {
  featureId: "f1",
  root: "develop",
  repoPath: "/repo",
  featureWorktrees: [{ path: "/a", name: "a", branch: "feat/a" }],
  repoWorktrees: [
    { path: "/a", name: "a", branch: "feat/a" },
    { path: "/b", name: "b", branch: "feat/b" },
    { path: "/broken", name: "broken", branch: "feat/c" },
  ],
};

describe("FeatureCheckRunner", () => {
  it("runs fetch, behind counts and overlap detection", async () => {
    const warn = vi.fn();
    const execFile = fakeExecFile(({ args }) => {
      const [, cwd, command] = args;
      if (command === "fetch") return "";
      if (command === "rev-list") return "3\n";
      if (cwd === "/broken") return execError("bad", { stderr: "fatal" });
      if (command === "merge-base") return "base\n";
      if (command === "diff") return cwd === "/a" ? "shared.ts\nmine.ts\n" : "shared.ts\n";
      return "";
    });
    const runner = new FeatureCheckRunner({ execFile, warn, error: vi.fn(), now: () => 42 });
    expect(runner.get("f1")).toEqual({ kind: "idle" });
    const done = runner.start(input);
    expect(runner.get("f1")).toEqual({ kind: "running", startedAt: 42 });
    await runner.start(input);
    await done;
    expect(runner.get("f1")).toEqual({
      kind: "done",
      at: 42,
      root: "develop",
      behind: [{ worktree: "a", commits: 3 }],
      overlaps: [{ file: "shared.ts", worktree: "a", otherWorktree: "b", otherBranch: "feat/b" }],
    });
    expect(execFile.calls.filter((call) => call.args.includes("fetch"))).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("records a failure when fetch fails", async () => {
    const error = vi.fn();
    const runner = new FeatureCheckRunner({
      execFile: fakeExecFile(() => new Error("offline")),
      warn: vi.fn(),
      error,
      now: () => 7,
    });
    await runner.start(input);
    expect(runner.get("f1")).toEqual({ kind: "failed", at: 7, error: "offline" });
    expect(error).toHaveBeenCalledOnce();
  });
});
