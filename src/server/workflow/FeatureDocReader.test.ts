import { describe, expect, it, vi } from "vitest";
import { fakeFileSystem } from "@/server/shared/fakes";
import { FeatureDocReader } from "./FeatureDocReader";

function reader(files: Parameters<typeof fakeFileSystem>[0], warn = vi.fn()) {
  const fs = fakeFileSystem(files);
  return {
    fs,
    warn,
    reader: new FeatureDocReader({
      fs,
      warn,
      pullRequestOf: () => ({ kind: "loading" }),
    }),
  };
}

describe("FeatureDocReader", () => {
  it("lists feature.json paths under docs/features", async () => {
    const { reader: r } = reader({ "/w/docs/features/f1/feature.json": { content: "{}" } });
    expect(await r.docsIn("/w")).toEqual(["/w/docs/features/f1/feature.json"]);
    expect(await r.docsIn("/none")).toEqual([]);
  });

  it("loads summaries, first document per id wins, missing files are skipped quietly", async () => {
    const { reader: r, warn } = reader({
      "/a/feature.json": { content: JSON.stringify({ id: "f1", title: "One", root: "develop", rows: [{ id: "r" }] }) },
      "/a/index.html": { content: "" },
      "/b/feature.json": { content: JSON.stringify({ id: "f1", title: "Dup" }) },
      "/c/feature.json": { content: JSON.stringify({ title: "Named by folder" }) },
    });
    const features = await r.load(["/a/feature.json", "/missing/feature.json", "/b/feature.json", "/c/feature.json"]);
    expect(features.map((feature) => [feature.id, feature.title])).toEqual([
      ["f1", "One"],
      ["c", "Named by folder"],
    ]);
    expect(features[0]).toMatchObject({ root: "develop", pageIndex: "/a/index.html" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("re-reads only when mtime changes and warns on unreadable documents", async () => {
    const files = { "/a/feature.json": { content: "{}", mtimeMs: 1 }, "/b/feature.json": { content: "nope" } };
    const { reader: r, fs, warn } = reader(files);
    await r.load(["/a/feature.json", "/b/feature.json"]);
    await r.load(["/a/feature.json"]);
    expect(fs.reads.filter((file) => file === "/a/feature.json")).toHaveLength(1);
    files["/a/feature.json"].mtimeMs = 2;
    await r.load(["/a/feature.json"]);
    expect(fs.reads.filter((file) => file === "/a/feature.json")).toHaveLength(2);
    expect(warn).toHaveBeenCalledOnce();
  });
});
