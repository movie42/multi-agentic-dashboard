import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SketchItem } from "@/common/sketch/types";
import { SketchStore } from "./SketchStore";

const note = (id: string): SketchItem => ({ kind: "note", id, x: 0, y: 0, w: 100, h: 80, color: "yellow", text: id });

async function setup(initial?: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "sketches-"));
  const file = path.join(dir, "sketches.json");
  if (initial !== undefined) await writeFile(file, initial);
  return { dir, file, store: (warn: (scope: string) => void = () => undefined) => new SketchStore(file, warn, () => 1000) };
}

describe("SketchStore", () => {
  it("reads an empty canvas without writing a file", async () => {
    const { store, dir } = await setup();
    expect(await store().read("/repo")).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });

  it("keeps each canvas apart when saves arrive together", async () => {
    const { store, file } = await setup();
    const sketches = store();
    await Promise.all([sketches.write("/a", [note("a")]), sketches.write("/b", [note("b")])]);
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(Object.keys(saved.boards).sort()).toEqual(["/a", "/b"]);
    expect(await sketches.read("/a")).toEqual([note("a")]);
  });

  it("drops a canvas's entry when its drawing is emptied", async () => {
    const { store, file } = await setup();
    const sketches = store();
    await sketches.write("/a", [note("a")]);
    await sketches.write("/a", []);
    expect(JSON.parse(await readFile(file, "utf8")).boards).toEqual({});
  });

  it("moves a broken file aside instead of overwriting it", async () => {
    const { store, dir } = await setup("{not json");
    const warnings: string[] = [];
    expect(await store((scope) => warnings.push(scope)).read("/a")).toEqual([]);
    expect(warnings).toEqual(["sketches"]);
    expect(await readdir(dir)).toEqual(["sketches.json.1000.bak"]);
  });
});
