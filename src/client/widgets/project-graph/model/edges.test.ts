import { describe, expect, it } from "vitest";
import { edgeGeometry } from "./edges";

const box = (x: number, y: number) => ({ x, y, w: 100, h: 80 });

describe("edgeGeometry", () => {
  it("joins side-by-side lanes across their facing sides", () => {
    const { d } = edgeGeometry({ id: "o", kind: "overlap", from: box(300, 0), to: box(0, 10), label: null });
    expect(d.startsWith("M300 18")).toBe(true);
    expect(d.endsWith("100 28")).toBe(true);
  });

  it("enters a side-by-side session from its facing side, in the link's direction", () => {
    const { d } = edgeGeometry({ id: "n", kind: "next", from: box(0, 0), to: box(300, 0), label: null });
    expect(d.startsWith("M100 40")).toBe(true);
    expect(d.endsWith("300 40")).toBe(true);
  });

  it("runs a downward edge from the bottom of one box to the top of the next", () => {
    const { d } = edgeGeometry({ id: "d", kind: "next", from: box(0, 0), to: box(200, 200), label: null });
    expect(d.startsWith("M50 80")).toBe(true);
    expect(d.endsWith("250 200")).toBe(true);
  });

  it("keeps a delegation and its report apart", () => {
    const delegate = edgeGeometry({ id: "d", kind: "delegate", from: box(0, 0), to: box(0, 200), label: null });
    const report = edgeGeometry({ id: "r", kind: "report", from: box(0, 200), to: box(0, 0), label: null });
    expect(delegate.d.startsWith("M38 80")).toBe(true);
    expect(report.d.startsWith("M62 200")).toBe(true);
  });
});
