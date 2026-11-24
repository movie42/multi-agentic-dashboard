import { describe, expect, it } from "vitest";
import { adopt, boundsOf, capPoints, dragBox, hitItems, moveItems, penPath, placed, resizeItem, simplify } from "./ops";
import type { SketchItem } from "./types";

const note: SketchItem = { kind: "note", id: "n", x: 0, y: 0, w: 100, h: 80, color: "yellow", text: "hi" };
const arrow: SketchItem = { kind: "arrow", id: "a", x1: 10, y1: 10, x2: 50, y2: 90, color: "gray" };
const pen: SketchItem = { kind: "pen", id: "p", points: [[5, 5], [20, 0], [10, 30]], color: "blue" };

describe("sketch ops", () => {
  it("turns a drag in any direction into a box with a positive size", () => {
    expect(dragBox({ x: 50, y: 40 }, { x: 10, y: 100 })).toEqual({ x: 10, y: 40, w: 40, h: 60 });
  });

  it("measures every kind", () => {
    expect(boundsOf(note)).toEqual({ x: 0, y: 0, w: 100, h: 80 });
    expect(boundsOf(arrow)).toEqual({ x: 10, y: 10, w: 40, h: 80 });
    expect(boundsOf(pen)).toEqual({ x: 5, y: 0, w: 15, h: 30 });
  });

  it("moves only the named items, every kind by its own coordinates", () => {
    const moved = moveItems([note, arrow, pen], new Set(["a", "p"]), { x: 5, y: -5 });
    expect(moved[0]).toBe(note);
    expect(moved[1]).toMatchObject({ x1: 15, y1: 5, x2: 55, y2: 85 });
    expect(moved[2]).toMatchObject({ points: [[10, 0], [25, -5], [15, 25]] });
  });

  it("resizes a box from its corner and keeps a minimum size", () => {
    expect(resizeItem(note, { x: 140, y: 120 })).toMatchObject({ w: 140, h: 120 });
    expect(resizeItem(note, { x: -50, y: -50 })).toMatchObject({ w: 16, h: 16 });
    expect(resizeItem(arrow, { x: 1, y: 1 })).toBe(arrow);
  });

  it("finds the items a selection box touches", () => {
    expect(hitItems([note, arrow, pen], { x: 40, y: 60, w: 100, h: 100 }).map((item) => item.id)).toEqual(["n", "a"]);
  });

  it("drops pen points closer than the tolerance and keeps both ends", () => {
    expect(simplify([[0, 0], [0.5, 0.5], [1, 1], [10, 10], [10.4, 10]], 2)).toEqual([[0, 0], [10, 10], [10.4, 10]]);
  });

  it("draws a pen line as one path, and a dot for a single point", () => {
    expect(penPath([[0, 0], [10, 0], [10, 10]])).toBe("M 0 0 L 10 0 L 10 10");
    expect(penPath([[3, 4]])).toBe("M 3 4 L 3.01 4");
  });

  it("follows its frame by how far the frame moved since the item was placed", () => {
    const inFrame: SketchItem = { ...note, parent: { id: "wt:a", x: -20, y: 0 } };
    expect(placed(inFrame, new Map([["wt:a", { x: 30, y: 10 }]]))).toMatchObject({ x: 50, y: 10 });
    expect(placed(note, new Map([["wt:a", { x: 30, y: 10 }]]))).toBe(note);
  });

  it("stays where it was last seen when its frame is gone", () => {
    const orphan: SketchItem = { ...note, parent: { id: "wt:gone", x: 0, y: 0 } };
    expect(placed(orphan, new Map())).toMatchObject({ x: 0, y: 0 });
  });

  it("joins the frame it is dropped in, or leaves every frame", () => {
    const origins = new Map([["wt:a", { x: 5, y: 6 }]]);
    expect(adopt(arrow, "wt:a", origins)).toMatchObject({ x1: 10, parent: { id: "wt:a", x: 5, y: 6 } });
    expect(adopt({ ...note, parent: { id: "wt:a", x: 0, y: 0 } }, undefined, origins)).not.toHaveProperty("parent");
  });

  it("thins a stroke past the save limit, keeping both ends", () => {
    const stroke = Array.from({ length: 10 }, (_, index): [number, number] => [index, 0]);
    const thinned = capPoints(stroke, 4);
    expect(thinned).toHaveLength(4);
    expect(thinned[0]).toEqual([0, 0]);
    expect(thinned.at(-1)).toEqual([9, 0]);
    expect(capPoints(stroke, 20)).toBe(stroke);
  });
});
