import { describe, expect, it } from "vitest";
import { keysToPick } from "./terminalMenu";

describe("keysToPick", () => {
  it("moves from the cursor and confirms", () => {
    const menu = { options: ["a", "b", "c"], cursor: 1 };
    expect(keysToPick(menu, 0)).toEqual(["up", "enter"]);
    expect(keysToPick(menu, 1)).toEqual(["enter"]);
    expect(keysToPick(menu, 2)).toEqual(["down", "enter"]);
  });
});
