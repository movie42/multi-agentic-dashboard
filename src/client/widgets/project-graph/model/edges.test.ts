import { describe, expect, it } from "vitest";
import { edgeGeometry } from "./edges";

const box = (x: number, y: number) => ({ x, y, w: 100, h: 80 });

describe("edgeGeometry", () => {
  it("joins side-by-side lanes across their facing sides", () => {
    const { d } = edgeGeometry({ id: "o", kind: "overlap", from: box(300, 0), to: box(0, 10), label: null });
    expect(d.startsWith("M100 28")).toBe(true);
    expect(d.endsWith("300 18")).toBe(true);
  });

  it("runs a downward edge from the bottom of one box to the top of the next", () => {
    const { d } = edgeGeometry({ id: "d", kind: "delegate", from: box(0, 0), to: box(200, 200), label: null });
    expect(d.startsWith("M50 80")).toBe(true);
    expect(d.endsWith("250 200")).toBe(true);
  });
});
