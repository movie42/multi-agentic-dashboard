import { describe, expect, it } from "vitest";
import { appendDictation } from "./DictationButton";

describe("appendDictation", () => {
  it("fills an empty field, joins with one space and ignores an empty transcript", () => {
    expect(appendDictation("", " 안녕 ")).toBe("안녕");
    expect(appendDictation("첫 줄", "둘째")).toBe("첫 줄 둘째");
    expect(appendDictation("첫 줄\n", "둘째")).toBe("첫 줄\n둘째");
    expect(appendDictation("그대로", "  ")).toBe("그대로");
  });
});
