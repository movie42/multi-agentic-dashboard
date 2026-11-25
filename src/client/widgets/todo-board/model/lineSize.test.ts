import { describe, expect, it } from "vitest";
import { barLines, clampSize, readSize, ROW_HEIGHT, TITLE_WIDTH, titleLines } from "./lineSize";

describe("clampSize", () => {
  it("keeps a size inside its range and rounds it", () => {
    expect(clampSize(10, ROW_HEIGHT)).toBe(ROW_HEIGHT.min);
    expect(clampSize(9999, TITLE_WIDTH)).toBe(TITLE_WIDTH.max);
    expect(clampSize(47.6, ROW_HEIGHT)).toBe(48);
  });
});

describe("readSize", () => {
  it("falls back to the default for a missing or broken stored value", () => {
    expect(readSize(undefined, ROW_HEIGHT)).toBe(ROW_HEIGHT.fallback);
    expect(readSize("abc", TITLE_WIDTH)).toBe(TITLE_WIDTH.fallback);
  });

  it("reads a stored value, clamped", () => {
    expect(readSize("80", ROW_HEIGHT)).toBe(80);
    expect(readSize("5", TITLE_WIDTH)).toBe(TITLE_WIDTH.min);
  });
});

describe("visible lines", () => {
  it("shows one line at the default row height", () => {
    expect(titleLines(ROW_HEIGHT.fallback)).toBe(1);
    expect(barLines(ROW_HEIGHT.fallback)).toBe(1);
  });

  it("shows more lines as the row grows", () => {
    expect(titleLines(44)).toBe(2);
    expect(titleLines(80)).toBe(4);
    expect(barLines(80)).toBe(4);
  });

  it("never drops below one line", () => {
    expect(titleLines(ROW_HEIGHT.min)).toBe(1);
    expect(barLines(ROW_HEIGHT.min)).toBe(1);
  });
});
