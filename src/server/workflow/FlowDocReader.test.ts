import { describe, expect, it, vi } from "vitest";
import { fakeFileSystem } from "@/server/shared/fakes";
import { FlowDocReader } from "./FlowDocReader";

const TASK = JSON.stringify({ id: "t1", branch: "feat/x", stages: { plan: { status: "now" } } });

describe("FlowDocReader", () => {
  it("scans domains with domain.json and reads tasks", async () => {
    const fs = fakeFileSystem({
      "/w/docs/d/domain.json": { content: "{}" },
      "/w/docs/d/prd.md": { content: "" },
      "/w/docs/d/tasks/t1.json": { content: TASK, mtimeMs: 3 },
      "/w/docs/d/t1/index.html": { content: "" },
      "/w/docs/nodomain/tasks/x.json": { content: TASK },
      "/w/docs/d/tasks/notes.txt": { content: "" },
    });
    const scan = await new FlowDocReader(fs, vi.fn()).scan("/w", "feat/x");
    expect(scan.branch).toBe("feat/x");
    expect(scan.tasks).toHaveLength(1);
    expect(scan.tasks[0]).toMatchObject({
      taskId: "t1",
      domain: "d",
      prdExists: true,
      pageIndex: "/w/docs/d/t1/index.html",
      plan: "now",
      updatedAt: 3,
    });
  });

  it("returns nothing for a worktree without docs, without warning", async () => {
    const warn = vi.fn();
    expect((await new FlowDocReader(fakeFileSystem({}), warn).scan("/w", null)).tasks).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("re-reads a task only when its mtime changes", async () => {
    const files = {
      "/w/docs/d/domain.json": { content: "{}" },
      "/w/docs/d/tasks/t1.json": { content: TASK, mtimeMs: 1 },
    };
    const fs = fakeFileSystem(files);
    const reader = new FlowDocReader(fs, vi.fn());
    await reader.scan("/w", null);
    await reader.scan("/w", null);
    expect(fs.reads.filter((file) => file.endsWith("t1.json"))).toHaveLength(1);
    files["/w/docs/d/tasks/t1.json"].mtimeMs = 2;
    await reader.scan("/w", null);
    expect(fs.reads.filter((file) => file.endsWith("t1.json"))).toHaveLength(2);
  });

  it("skips unreadable tasks with a warning", async () => {
    const warn = vi.fn();
    const fs = fakeFileSystem({
      "/w/docs/d/domain.json": { content: "{}" },
      "/w/docs/d/tasks/bad.json": { content: "{not json" },
    });
    expect((await new FlowDocReader(fs, warn).scan("/w", null)).tasks).toEqual([]);
    expect(warn).toHaveBeenCalledWith("flow", expect.any(Error), expect.objectContaining({ file: "/w/docs/d/tasks/bad.json" }));
  });
});
