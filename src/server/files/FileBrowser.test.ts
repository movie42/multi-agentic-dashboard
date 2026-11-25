import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBrowser } from "./FileBrowser";

let root: string;
let browser: FileBrowser;

beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(tmpdir(), "file-browser-")));
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "node_modules/pkg"), { recursive: true });
  await writeFile(path.join(root, "src/a.ts"), "const a = 1;\n");
  await writeFile(path.join(root, ".env"), "SECRET=1\n");
  await writeFile(path.join(root, "README.md"), "# Title\n");
  await writeFile(path.join(root, "node_modules/pkg/index.js"), "module.exports = 1;\n");
  await writeFile(path.join(root, "blob.bin"), Buffer.from([1, 0, 2, 3]));
  await writeFile(path.join(root, "logo.png"), Buffer.from([137, 80, 78, 71]));
  browser = new FileBrowser({
    worktreePaths: async () => [root],
    highlight: async (code) => code.split("\n").map((line) => `<span>${line}</span>`),
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("FileBrowser", () => {
  it("lists every entry, hidden and ignored ones included, folders first", async () => {
    const result = await browser.list(root);
    expect(result.ok && result.entries.map((entry) => entry.name)).toEqual([
      "node_modules",
      "src",
      ".env",
      "blob.bin",
      "logo.png",
      "README.md",
    ]);
  });

  it("reads a file outside every worktree", async () => {
    const outside = await realpath(await mkdtemp(path.join(tmpdir(), "file-browser-outside-")));
    try {
      await writeFile(path.join(outside, "shot.png"), Buffer.from([137, 80, 78, 71]));
      await writeFile(path.join(outside, "note.txt"), "hi\n");
      const image = await browser.read(path.join(outside, "shot.png"));
      expect(image.ok && image.content.kind).toBe("image");
      const raw = await browser.raw(path.join(outside, "shot.png"));
      expect(raw.ok && raw.contentType).toBe("image/png");
      const text = await browser.read(path.join(outside, "note.txt"));
      expect(text.ok && text.content.kind).toBe("text");
      const listed = await browser.list(outside);
      expect(listed.ok && listed.entries.map((entry) => entry.name)).toEqual(["note.txt", "shot.png"]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("answers 404 for a missing file", async () => {
    await expect(browser.read(path.join(root, "nope.ts"))).resolves.toEqual({ ok: false, status: 404 });
  });

  it("reads text, markdown, image and binary files by kind", async () => {
    const text = await browser.read(path.join(root, "src/a.ts"));
    expect(text.ok && text.content).toEqual({ kind: "text", lines: ["<span>const a = 1;</span>", "<span></span>"], language: "ts" });
    const markdown = await browser.read(path.join(root, "README.md"));
    expect(markdown.ok && markdown.content.kind).toBe("markdown");
    const image = await browser.read(path.join(root, "logo.png"));
    expect(image.ok && image.content.kind).toBe("image");
    const binary = await browser.read(path.join(root, "blob.bin"));
    expect(binary.ok && binary.content.kind).toBe("binary");
  });

  it("searches without node_modules by default and with it when asked", async () => {
    const light = await browser.search(root, false);
    expect(light.ok && light.files).toEqual([".env", "README.md", "blob.bin", "logo.png", "src/a.ts"]);
    const all = await browser.search(root, true);
    expect(all.ok && all.files).toContain("node_modules/pkg/index.js");
  });

  it("refuses to search a folder the board does not know", async () => {
    await expect(browser.search(path.join(root, "src"), false)).resolves.toEqual({ ok: false, status: 403 });
  });
});
