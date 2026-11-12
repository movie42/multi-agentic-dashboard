import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FlowAnswerStore } from "./FlowAnswerStore";

const PAGE = "/w/docs/gift/APP-1/02-grill.html";

async function storeIn(viewable = true) {
  const dir = await mkdtemp(path.join(tmpdir(), "flow-answers-"));
  return { dir, store: new FlowAnswerStore({ dir, isViewable: async () => viewable }) };
}

describe("FlowAnswerStore", () => {
  it("writes the page folder and the parsed state, and removes the file when the state is cleared", async () => {
    const { dir, store } = await storeIn();
    const state = JSON.stringify({ answers: { "R1-Q1": { choice: "a" } }, checks: {}, updatedAt: 5 });
    expect(await store.save(PAGE, state)).toEqual({ ok: true, folder: "/w/docs/gift/APP-1/", count: 1 });
    const [file = ""] = await readdir(dir);
    expect(JSON.parse(await readFile(path.join(dir, file), "utf8"))).toMatchObject({
      folder: "/w/docs/gift/APP-1/",
      state: { updatedAt: 5 },
    });
    await store.save(PAGE, null);
    expect(await readdir(dir)).toEqual([]);
  });

  it("refuses pages outside docs and values that are not flow answers", async () => {
    expect(await (await storeIn(false)).store.save(PAGE, "{}")).toEqual({ ok: false, reason: "not-a-doc" });
    const { store } = await storeIn();
    expect(await store.save(PAGE, "not json")).toEqual({ ok: false, reason: "bad-state" });
    expect(await store.save(PAGE, '{"checks":{}}')).toEqual({ ok: false, reason: "bad-state" });
  });
});
