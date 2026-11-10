import { describe, expect, it } from "vitest";
import { flowTask } from "../../../test/fixtures";
import { isFinishedFlowTask, mergeRepoFlowTasks, splitFlowTasks, summarizeFlowTask } from "./flowTasks";

const location = { domain: "d", domainDir: "/w/docs/d", prdExists: false, pageIndex: null, mtimeMs: 5 };

describe("summarizeFlowTask", () => {
  it("counts grill questions and checklist items, splitting -V items into tests", () => {
    const summary = summarizeFlowTask(
      {
        id: "t1",
        branch: "feat/x",
        feature: { doc: "/abs/feature.json" },
        stages: {
          grill: { rounds: [{ questions: [{ decision: "yes" }, {}] }] },
          plan: { status: "done" },
          tasks: {
            status: "now",
            blocks: [
              { type: "checklist", items: [{ id: "P1-1", done: true }, { id: "P1-2" }, { id: "P1-V", done: true }, "junk"] },
              { type: "table", items: [{ id: "ignored", done: true }] },
            ],
          },
          verify: { status: "bogus", blocks: [{ type: "checklist", items: [{ done: true }] }] },
        },
      },
      location,
    );
    expect(summary).toMatchObject({
      taskId: "t1",
      title: "t1",
      branch: "feat/x",
      prdExists: true,
      grill: { open: 1, total: 2 },
      plan: "done",
      screen: null,
      tasks: { status: "now", implDone: 1, implTotal: 2, testDone: 1, testTotal: 1 },
      verify: { status: "wait", done: 1, total: 1 },
      featureDoc: "/abs/feature.json",
      updatedAt: 5,
    });
  });

  it("falls back to the domain folder name and ignores relative feature docs", () => {
    const summary = summarizeFlowTask({ feature: { doc: "rel/feature.json" }, links: [{ label: "PRD 문서" }] }, location);
    expect(summary).toMatchObject({ taskId: "d", title: "", prdExists: true, featureDoc: null, grill: null });
  });
});

describe("isFinishedFlowTask", () => {
  it("needs at least one stage, every stage done and no open questions", () => {
    expect(isFinishedFlowTask(flowTask())).toBe(false);
    expect(isFinishedFlowTask(flowTask({ plan: "done" }))).toBe(true);
    expect(isFinishedFlowTask(flowTask({ plan: "done", grill: { open: 1, total: 1 } }))).toBe(false);
  });
});

describe("mergeRepoFlowTasks", () => {
  it("prefers the copy on the task's own branch, then the newest, sorted newest first", () => {
    const own = flowTask({ taskId: "a", branch: "feat/a", updatedAt: 1, title: "own" });
    const newer = flowTask({ taskId: "a", branch: "feat/a", updatedAt: 9, title: "newer" });
    const other = flowTask({ taskId: "b", updatedAt: 5 });
    const merged = mergeRepoFlowTasks([
      { branch: "main", tasks: [newer, other] },
      { branch: "feat/a", tasks: [own] },
    ]);
    expect(merged.map((task) => task.title)).toEqual(["Task", "own"]);
  });
});

describe("splitFlowTasks", () => {
  it("puts unfinished tasks on this branch in current", () => {
    const mine = flowTask({ taskId: "a", branch: "feat/a" });
    const done = flowTask({ taskId: "b", branch: "feat/a", plan: "done" });
    const other = flowTask({ taskId: "c", branch: "feat/c" });
    const split = splitFlowTasks([mine, done, other], { branch: "feat/a", tasks: [] });
    expect(split.current).toEqual([mine]);
    expect(split.other).toEqual([done, other]);
  });

  it("falls back to unfinished branchless tasks from this checkout when no branch matches", () => {
    const local = flowTask({ taskId: "a", branch: null });
    const split = splitFlowTasks([local], { branch: "feat/a", tasks: [local] });
    expect(split.current).toEqual([local]);
  });

  it("keeps a checkout's task recorded on another branch out of current", () => {
    const inherited = flowTask({ taskId: "a", branch: "feat/z" });
    const split = splitFlowTasks([inherited], { branch: "feat/a", tasks: [inherited] });
    expect(split.current).toEqual([]);
    expect(split.other).toEqual([inherited]);
  });
});
