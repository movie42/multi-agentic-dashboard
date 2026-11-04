import { describe, expect, it } from "vitest";
import { compareFiles, importGraph, readingRanks, resolveImport } from "./order";

describe("resolveImport", () => {
  const files = new Set(["src/a/index.ts", "src/b.tsx", "src/c/d.ts"]);
  it("resolves alias, relative and index imports", () => {
    expect(resolveImport("src/x.ts", "@/b", files)).toBe("src/b.tsx");
    expect(resolveImport("src/c/e.ts", "./d", files)).toBe("src/c/d.ts");
    expect(resolveImport("src/c/e.ts", "../a", files)).toBe("src/a/index.ts");
    expect(resolveImport("src/x.ts", "react", files)).toBeNull();
    expect(resolveImport("src/x.ts", "./missing", files)).toBeNull();
  });
});

describe("importGraph + readingRanks", () => {
  it("ranks types before implementations before screens, cutting cycles", () => {
    const contents = new Map([
      ["src/types.ts", "export type A = 1;"],
      ["src/impl.ts", 'import type { A } from "./types";\nimport "./cycle";'],
      ["src/cycle.ts", 'import { x } from "./impl";'],
      ["src/Screen.tsx", 'import { impl } from "@/impl";\nconst m = await import("./types");'],
      ["README.md", 'import "./impl"'],
    ]);
    const deps = importGraph(contents);
    expect(deps.has("README.md")).toBe(false);
    expect(deps.get("src/Screen.tsx")?.sort()).toEqual(["src/impl.ts", "src/types.ts"]);
    expect(Object.fromEntries(readingRanks(deps))).toMatchSnapshot();
  });
});

describe("compareFiles", () => {
  it("sorts by rank, then type files, then path", () => {
    const ranks = new Map([
      ["b.ts", 0],
      ["a.ts", 0],
      ["types.ts", 0],
      ["z.ts", 1],
    ]);
    expect(["z.ts", "b.ts", "types.ts", "a.ts"].sort((a, b) => compareFiles(ranks, a, b))).toEqual([
      "types.ts",
      "a.ts",
      "b.ts",
      "z.ts",
    ]);
  });
});
