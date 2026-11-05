import { mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AskThread } from "@/common/intentDiff/types";
import { AskStore } from "./AskStore";

async function tempFile(): Promise<string> {
  return path.join(await mkdtemp(path.join(tmpdir(), "ask-store-")), "share", "ask-threads.json");
}

function thread(id: string, overrides: Partial<AskThread> = {}): AskThread {
  return {
    id,
    worktreePath: "/w",
    anchor: { kind: "lines", file: "a.ts", startLine: 1, endLine: 2 },
    label: "a.ts",
    target: { kind: "fresh", reason: "chosen" },
    sessionId: `session-${id}`,
    cwd: "/w",
    turns: [{ question: "왜?", answer: null, error: null, askedAt: 1, answeredAt: null }],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("AskStore", () => {
  it("returns nothing when the file does not exist, without a warning", async () => {
    const warn = vi.fn();
    const store = new AskStore(await tempFile(), warn);
    expect(await store.list("/w")).toEqual([]);
    expect(await store.sessionIds()).toEqual(new Set());
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps both threads when two saves run together", async () => {
    const file = await tempFile();
    const store = new AskStore(file, vi.fn());
    await Promise.all([store.save(thread("a")), store.save(thread("b", { worktreePath: "/other" }))]);
    expect((await store.list("/w")).map((item) => item.id)).toEqual(["a"]);
    expect(await store.get("b")).toMatchObject({ worktreePath: "/other" });
    await store.save(thread("a", { label: "changed" }));
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.threads.map((item: AskThread) => item.label)).toEqual(["changed", "a.ts"]);
  });

  it("drops a malformed thread and reports it", async () => {
    const file = await tempFile();
    const warn = vi.fn();
    const store = new AskStore(file, warn);
    await store.save(thread("a"));
    await writeFile(file, JSON.stringify({ threads: [thread("a"), { id: 3 }] }));
    expect((await store.list("/w")).map((item) => item.id)).toEqual(["a"]);
    expect(warn).toHaveBeenCalledWith("ask-store", expect.anything(), { file, index: 1 });
  });

  it("re-reads session ids only when the file mtime changes", async () => {
    const file = await tempFile();
    const store = new AskStore(file, vi.fn());
    await store.save(thread("a"));
    const first = await store.sessionIds();
    expect(first).toEqual(new Set(["session-a"]));
    expect(await store.sessionIds()).toBe(first);
    await writeFile(file, JSON.stringify({ threads: [thread("a"), thread("b")] }));
    await utimes(file, new Date(), new Date(Date.now() + 5000));
    expect(await store.sessionIds()).toEqual(new Set(["session-a", "session-b"]));
  });

  it("rewrites only the named threads in one write and keeps old threads without a conclusion readable", async () => {
    const file = await tempFile();
    const store = new AskStore(file, vi.fn());
    await store.save(thread("a"));
    await store.save(thread("b"));
    const conclusion = { text: "고쳐요", needsChange: true, draftedAt: 2, confirmedAt: 3, sentAt: null };
    const updated = await store.update(["b", "gone"], (item) => ({ ...item, conclusion }));
    expect(updated.map((item) => item.id)).toEqual(["b"]);
    expect((await store.get("b"))?.conclusion).toEqual(conclusion);
    expect((await store.get("a"))?.conclusion).toBeUndefined();
  });
});
