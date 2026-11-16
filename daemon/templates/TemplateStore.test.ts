import { describe, expect, it } from "vitest";
import { TemplateStore } from "./TemplateStore.ts";

function memoryStore(initial: string | null) {
  const files = new Map<string, string>(initial === null ? [] : [["/t.json", initial]]);
  const store = new TemplateStore({
    file: "/t.json",
    read: async (file) => {
      const body = files.get(file);
      if (body === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return body;
    },
    write: async (file, body) => {
      files.set(file, body);
    },
    now: () => 42,
  });
  return { store, files };
}

describe("TemplateStore", () => {
  it("lists nothing before the file exists, then saves, replaces and removes by id", async () => {
    const { store, files } = memoryStore(null);
    expect(await store.list()).toEqual([]);
    await store.save({ id: "a", name: "A", cards: [{ key: "one" }] });
    await store.save({ id: "b", name: "B", cards: [{ key: "one" }] });
    await store.save({ id: "a", name: "A2", cards: [{ key: "two" }] });
    expect((await store.list()).map((template) => `${template.id}:${template.name}:${template.updatedAt}`)).toEqual(["b:B:42", "a:A2:42"]);
    expect(await store.remove("b")).toBe(true);
    expect(await store.remove("b")).toBe(false);
    expect(JSON.parse(files.get("/t.json") ?? "").templates).toHaveLength(1);
  });

  it("refuses a template without cards and reads hand edits on the next list", async () => {
    const { store, files } = memoryStore(JSON.stringify({ templates: [{ id: "x", cards: [{ key: "k" }] }] }));
    expect(await store.save({ id: "y", cards: [] })).toBeNull();
    files.set("/t.json", JSON.stringify({ templates: [] }));
    expect(await store.list()).toEqual([]);
  });
});
