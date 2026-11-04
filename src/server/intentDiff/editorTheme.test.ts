import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EditorThemeReader } from "./editorTheme";

describe("EditorThemeReader", () => {
  it("falls back to Light+/Dark+ without a settings file", async () => {
    const reader = new EditorThemeReader("/nonexistent/settings.json", vi.fn());
    expect((await reader.themes()).key).toBe("plus");
  });

  it("layers the user's token colors over Light+ and caches by mtime", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "theme-")), "settings.json");
    await writeFile(
      file,
      `{
        // comment
        "editor.tokenColorCustomizations": { "textMateRules": [{ "scope": "keyword", "settings": { "foreground": "#ff0000" } }], },
      }`,
    );
    const reader = new EditorThemeReader(file, vi.fn());
    const first = await reader.themes();
    expect(first.key).not.toBe("plus");
    expect(await reader.themes()).toBe(first);
  });

  it("warns and falls back on unreadable JSON", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "theme-")), "settings.json");
    await writeFile(file, "{ not json");
    const warn = vi.fn();
    expect((await new EditorThemeReader(file, warn).themes()).key).toBe("plus");
    expect(warn).toHaveBeenCalledOnce();
  });
});
