import darkPlus from "@shikijs/themes/dark-plus";
import lightPlus from "@shikijs/themes/light-plus";
import { describe, expect, it, vi } from "vitest";
import { Highlighter, trimIndent } from "./Highlighter";

function highlighter() {
  const themes = vi.fn(async () => ({ light: lightPlus, dark: darkPlus, key: "plus" }));
  return { themes, instance: new Highlighter({ themes, readBlobs: vi.fn(async () => new Map()), warn: vi.fn() }) };
}

describe("trimIndent", () => {
  it("drops leading whitespace spans", () => {
    expect(trimIndent('<span style="a">  </span><span style="b">  x</span><span> y</span>')).toBe(
      '<span style="b">x</span><span> y</span>',
    );
  });
});

describe("Highlighter", () => {
  it("escapes files it has no grammar for", async () => {
    const { instance, themes } = highlighter();
    expect(await instance.lines("<a>\nb", "notes.txt")).toEqual(["&lt;a&gt;", "b"]);
    expect(themes).not.toHaveBeenCalled();
  });

  it("marks identifiers and caches by content", async () => {
    const { instance } = highlighter();
    const first = await instance.lines("const total = 1;", "a.ts");
    expect(first[0]).toContain('class="sym" data-col="6"');
    expect(first[0]).not.toContain('data-col="0"');
    expect(await instance.lines("const total = 1;", "b.ts")).toBe(first);
  }, 30_000);
});
