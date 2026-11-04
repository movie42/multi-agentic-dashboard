import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseSnapshotLog, SNAPSHOT_LOG_NAME, SnapshotLog } from "./SnapshotLog";

const DIFF = [
  "diff --git a/a.ts b/a.ts",
  "--- a/a.ts",
  "+++ b/a.ts",
  "@@ -1 +1 @@",
  "-old",
  "+new",
  "",
].join("\n");

async function gitDirWithLog(lines: string[]): Promise<string> {
  const gitDir = path.join(await mkdtemp(path.join(tmpdir(), "snapshots-")), ".git");
  await mkdir(gitDir, { recursive: true });
  await writeFile(path.join(gitDir, SNAPSHOT_LOG_NAME), lines.join("\n"));
  return gitDir;
}

const record = (at: number, tree: string) => JSON.stringify({ at, sessionId: "s", toolUseId: null, tool: "Edit", tree });

describe("parseSnapshotLog", () => {
  it("keeps valid records and counts the rest", () => {
    expect(parseSnapshotLog(`${record(1, "t1")}\n{"at":"x"}\nnope\n\n`)).toEqual({
      records: [{ at: 1, sessionId: "s", toolUseId: null, tool: "Edit", tree: "t1" }],
      invalid: 2,
    });
  });
});

describe("SnapshotLog", () => {
  it("builds one step per pair inside the range and caches tree diffs", async () => {
    const gitDir = await gitDirWithLog([record(1, "t1"), record(2, "t2"), record(3, "t3")]);
    const git = vi.fn(async (_cwd: string, args: string[]) => (args[0] === "rev-parse" ? `${gitDir}\n` : DIFF));
    const log = new SnapshotLog(git, vi.fn());
    const steps = await log.loadSteps(["/w"], 2, null);
    expect(steps.map((step) => [step.previousTree, step.record.tree])).toEqual([
      ["t1", "t2"],
      ["t2", "t3"],
    ]);
    expect(steps[0].changes).toEqual({ "a.ts": { added: ["new"], removed: ["old"], precision: "exact" } });
    await log.loadSteps(["/w"], 2, null);
    expect(git.mock.calls.filter(([, args]) => args[0] === "diff-tree")).toHaveLength(2);
  });

  it("reports a failed diff and does not cache it", async () => {
    const gitDir = await gitDirWithLog([record(1, "t1"), record(2, "t2")]);
    const git = vi.fn(async (_cwd: string, args: string[]) => {
      if (args[0] === "rev-parse") return gitDir;
      throw new Error("bad tree");
    });
    const warn = vi.fn();
    const log = new SnapshotLog(git, warn);
    expect((await log.loadSteps(["/w"], 0, null))[0].changes).toEqual({});
    await log.loadSteps(["/w"], 0, null);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("returns null without a report when the file is absent at that tree", async () => {
    const warn = vi.fn();
    const missing = Object.assign(new Error("fatal"), { stderr: "fatal: path 'x' does not exist in 't1'" });
    const log = new SnapshotLog(vi.fn().mockRejectedValue(missing), warn);
    expect(await log.readAtTree("/w", "t1", "x")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
