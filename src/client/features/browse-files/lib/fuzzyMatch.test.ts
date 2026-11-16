import { describe, expect, it } from "vitest";
import { fuzzyMatch, rankFiles } from "./fuzzyMatch";

describe("fuzzyMatch", () => {
  it("matches letters typed with gaps, in order", () => {
    expect(fuzzyMatch("dcpnl", "src/client/widgets/doc-panel/ui/DocPanel.tsx")).not.toBeNull();
    expect(fuzzyMatch("lnpcd", "src/client/widgets/doc-panel/ui/DocPanel.tsx")).toBeNull();
  });

  it("records the matched positions", () => {
    expect(fuzzyMatch("ab", "a/b.ts")?.indices).toEqual([0, 2]);
  });

  it("ranks a file-name match above a scattered folder match", () => {
    const ranked = rankFiles("panel", ["src/p/a/n/e/l/index.ts", "src/widgets/DocPanel.tsx"], 10);
    expect(ranked.map((hit) => hit.path)).toEqual(["src/widgets/DocPanel.tsx", "src/p/a/n/e/l/index.ts"]);
  });

  it("ranks a compact file-name match above long build files with scattered letters", () => {
    const ranked = rankFiles("dcpnl", [
      ".next/dev/build/chunks/[turbopack-node]_transforms_webpack-loaders_ts_1nw9y6mi1x-xw._.js",
      "src/client/widgets/doc-panel/ui/DocPanel.tsx",
      ".next/dev/server/chunks/ssr/src_client_widgets_doc-panel_0r72fz52ww373._.js",
    ], 10);
    expect(ranked[0]?.path).toBe("src/client/widgets/doc-panel/ui/DocPanel.tsx");
  });

  it("returns at most the limit", () => {
    expect(rankFiles("a", ["a1", "a2", "a3"], 2)).toHaveLength(2);
  });
});
