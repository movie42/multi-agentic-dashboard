import { describe, expect, it } from "vitest";
import { matchesHint, plainText } from "./plan";

describe("plainText", () => {
  it("strips tags, unescapes entities and squashes spaces", () => {
    expect(plainText("<code>a &lt;b&gt;</code>\n  &amp; c")).toBe("a <b> & c");
  });
});

describe("matchesHint", () => {
  it.each([
    ["src/a.ts", "src/a.ts", true],
    ["src/x/a.ts", "src/", true],
    ["src/x/a.ts", "src", false],
    ["src/x/a.ts", "src/*.ts", false],
    ["src/a.ts", "src/*.ts", true],
    ["src/x/y/a.ts", "src/**/a.ts", true],
    ["src/a.tsx", "src/a.ts", false],
  ])("%s ~ %s → %s", (file, hint, expected) => {
    expect(matchesHint(file, hint)).toBe(expected);
  });
});
