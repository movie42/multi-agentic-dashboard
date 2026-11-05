import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BookmarkStore } from "./BookmarkStore";

async function setup(initial = "") {
  const dir = await mkdtemp(path.join(tmpdir(), "bookmarks-"));
  const file = path.join(dir, "bookmarks.jsonl");
  await writeFile(file, initial);
  return { file, store: new BookmarkStore(file, () => undefined, () => new Date(2026, 10, 5, 9, 0)) };
}

describe("BookmarkStore", () => {
  it("keeps every change when saves arrive together", async () => {
    const { store } = await setup();
    await Promise.all(["a", "b", "c"].map((id) => store.save({ sessionId: id, name: id, cwd: "/w", memo: "" })));
    expect([...(await store.read()).keys()].sort()).toEqual(["a", "b", "c"]);
  });

  it("leaves another provider's line with the same session id alone", async () => {
    const other = JSON.stringify({ provider: "codex", name: "x", session_id: "s1", cwd: "/w", created_at: "2026-01-01 00:00" });
    const { file, store } = await setup(`${other}\n`);
    await store.save({ sessionId: "s1", name: "mine", cwd: "/w", memo: "" });
    await store.remove("s1");
    expect(await readFile(file, "utf8")).toBe(`${other}\n`);
  });
});
