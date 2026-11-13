import { describe, expect, it } from "vitest";
import { layoutGraph } from "./layout";

const c = (sha: string, ...parents: string[]) => ({ sha, parents });

describe("layoutGraph", () => {
  it("keeps a straight history in one lane", () => {
    const { rows, laneCount } = layoutGraph([c("c", "b"), c("b", "a"), c("a")]);
    expect(rows.map((row) => row.lane)).toEqual([0, 0, 0]);
    expect(laneCount).toBe(1);
    expect(rows[2]?.segments).toEqual([{ fromLane: 0, from: "top", toLane: 0, to: "mid", lane: 0 }]);
  });

  it("opens a second lane for a merge and closes it where the branch started", () => {
    // m merges f into main; f and b both come from a.
    const { rows, laneCount } = layoutGraph([c("m", "b", "f"), c("f", "a"), c("b", "a"), c("a")]);
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 0, 0]);
    expect(laneCount).toBe(2);
    expect(rows[0]?.segments).toContainEqual({ fromLane: 0, from: "mid", toLane: 1, to: "bottom", lane: 1 });
    expect(rows[3]?.segments).toContainEqual({ fromLane: 1, from: "top", toLane: 0, to: "mid", lane: 1 });
  });

  it("gives two branch tips their own lanes and passes the other lane straight through", () => {
    const { rows } = layoutGraph([c("x", "a"), c("y", "a"), c("a")]);
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 0]);
    expect(rows[1]?.segments).toContainEqual({ fromLane: 0, from: "top", toLane: 0, to: "bottom", lane: 0 });
  });

  it("draws an octopus merge to three lanes and reuses a freed lane", () => {
    const { rows } = layoutGraph([c("o", "a", "b", "d"), c("b", "a"), c("d", "a"), c("a"), c("z")]);
    expect(rows[0]?.segments.filter((segment) => segment.from === "mid").map((segment) => segment.toLane)).toEqual([0, 1, 2]);
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 2, 0, 0]);
  });
});
