import { describe, expect, it } from "vitest";
import { addArea, areaOf, assignArea, parseAreas, removeArea, renameArea, splitByArea, toggleArea, type SessionArea } from "./areas";

const doing: SessionArea = { id: "doing", name: "하고 있는 일", memberIds: ["a"], collapsed: false };
const later: SessionArea = { id: "later", name: "나중에 볼 일", memberIds: ["b", "c"], collapsed: false };

describe("session areas", () => {
  it("adds an area at the end, taking its members out of the area they were in", () => {
    const next = addArea([doing, later], "new", "새 영역", ["c"]);
    expect(next.map((area) => [area.id, area.memberIds])).toEqual([
      ["doing", ["a"]],
      ["later", ["b"]],
      ["new", ["c"]],
    ]);
  });

  it("keeps an area that lost every member, so an empty area stays until removed", () => {
    expect(addArea([doing], "new", "새 영역", ["a"]).map((area) => [area.id, area.memberIds])).toEqual([
      ["doing", []],
      ["new", ["a"]],
    ]);
  });

  it("moves sessions into an area, or out of every area with null", () => {
    expect(areaOf(assignArea([doing, later], ["a"], "later"), "a")?.id).toBe("later");
    expect(areaOf(assignArea([doing, later], ["b"], null), "b")).toBeNull();
  });

  it("renames, folds and removes an area; removing hands its sessions back to the unnamed part", () => {
    expect(renameArea([doing], "doing", "지금")[0]?.name).toBe("지금");
    expect(toggleArea([doing], "doing")[0]?.collapsed).toBe(true);
    const removed = removeArea([doing, later], "later");
    expect(removed.map((area) => area.id)).toEqual(["doing"]);
    expect(areaOf(removed, "b")).toBeNull();
  });

  it("splits sessions in their own order into the unnamed part and each area in area order", () => {
    const items = ["c", "x", "a", "b", "y"].map((id) => ({ id }));
    const split = splitByArea(items, [later, doing]);
    expect(split.unassigned.map((item) => item.id)).toEqual(["x", "y"]);
    expect(split.sections.map((section) => [section.area.id, section.items.map((item) => item.id)])).toEqual([
      ["later", ["c", "b"]],
      ["doing", ["a"]],
    ]);
  });

  it("reads back only well-formed saved areas", () => {
    expect(parseAreas("nope")).toEqual([]);
    expect(
      parseAreas(JSON.stringify([{ id: "doing", name: "하고 있는 일", memberIds: ["a", 1], collapsed: true }, { id: 2 }, { id: "x", name: "엑스" }])),
    ).toEqual([
      { id: "doing", name: "하고 있는 일", memberIds: ["a"], collapsed: true },
      { id: "x", name: "엑스", memberIds: [], collapsed: false },
    ]);
  });
});
