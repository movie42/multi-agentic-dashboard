import { describe, expect, it } from "vitest";
import { findTerminalLinks, resolveTerminalPath, targetOfUri } from "./terminalLinks";

const texts = (line: string) => findTerminalLinks(line).map((link) => `${link.kind}:${link.text}`);

describe("findTerminalLinks", () => {
  it("finds URLs and trims trailing punctuation", () => {
    expect(texts("open http://localhost:3000/foo, then")).toEqual(["url:http://localhost:3000/foo"]);
    expect(texts("(see https://example.com/a)")).toEqual(["url:https://example.com/a"]);
    expect(texts("https://ko.wikipedia.org/wiki/A_(b)")).toEqual(["url:https://ko.wikipedia.org/wiki/A_(b)"]);
  });

  it("finds file paths with line numbers next to Korean text", () => {
    expect(texts("수정: src/client/a.tsx:42 에서")).toEqual(["path:src/client/a.tsx:42"]);
    expect(texts("⏺ Update(/Users/me/p/app/page.tsx)")).toEqual(["path:/Users/me/p/app/page.tsx"]);
    expect(texts("run ./scripts/build.sh.")).toEqual(["path:./scripts/build.sh"]);
  });

  it("skips paths inside URLs and slash words without a file", () => {
    expect(texts("https://github.com/a/b.git")).toEqual(["url:https://github.com/a/b.git"]);
    expect(texts("and/or feature/login")).toEqual([]);
    expect(texts("~/notes/a.md")).toEqual([]);
  });

  it("reports code-unit offsets", () => {
    const [link] = findTerminalLinks("가 src/a.ts");
    expect(link).toMatchObject({ start: 2, end: 10 });
  });
});

describe("resolveTerminalPath", () => {
  it("resolves against the session folder and drops the line suffix", () => {
    expect(resolveTerminalPath("src/a.ts:3:4", "/repo")).toBe("/repo/src/a.ts");
    expect(resolveTerminalPath("../b/c.ts", "/repo/x")).toBe("/repo/b/c.ts");
    expect(resolveTerminalPath("/abs/c.ts", null)).toBe("/abs/c.ts");
    expect(resolveTerminalPath("src/a.ts", null)).toBeNull();
  });
});

describe("targetOfUri", () => {
  it("turns file URIs into paths and keeps web URLs", () => {
    expect(targetOfUri("file:///Users/me/%ED%95%9C.md")).toBe("/Users/me/한.md");
    expect(targetOfUri("https://a.b")).toBe("https://a.b");
    expect(targetOfUri("vscode://x")).toBeNull();
  });
});
