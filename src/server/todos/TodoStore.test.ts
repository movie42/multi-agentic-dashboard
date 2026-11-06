import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TodoStore } from "./TodoStore";

async function setup(initial?: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "todos-"));
  const file = path.join(dir, "todos.json");
  if (initial !== undefined) await writeFile(file, initial);
  let n = 0;
  return { dir, file, store: (warn: (scope: string) => void) => new TodoStore(file, warn, () => 1000, () => `id-${++n}`) };
}

describe("TodoStore", () => {
  it("starts from the default board without writing a file", async () => {
    const { store, dir } = await setup();
    const board = await store(() => undefined).read();
    expect(board.statuses).toHaveLength(4);
    expect(await readdir(dir)).toEqual([]);
  });

  it("keeps every card when creates arrive together", async () => {
    const { store, file } = await setup();
    const todos = store(() => undefined);
    await Promise.all(["a", "b", "c"].map((title) => todos.apply({ type: "card-create", title })));
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.cards.map((card: { title: string }) => card.title).sort()).toEqual(["a", "b", "c"]);
  });

  it("moves a broken file aside instead of overwriting it", async () => {
    const { store, dir } = await setup("{not json");
    const warnings: string[] = [];
    const board = await store((scope) => warnings.push(scope)).read();
    expect(board.cards).toEqual([]);
    expect(warnings).toEqual(["todos"]);
    expect((await readdir(dir)).sort()).toEqual(["todos.json.1000.bak"]);
  });

  it("does not write when a rule refuses the op", async () => {
    const { store, dir } = await setup();
    await expect(store(() => undefined).apply({ type: "status-delete", statusId: "st-todo" })).rejects.toThrow("처음과 끝");
    expect(await readdir(dir)).toEqual([]);
  });
});
