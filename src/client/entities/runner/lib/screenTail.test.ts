import { describe, expect, it } from "vitest";
import { screenTail } from "./screenTail";

describe("screenTail", () => {
  it("keeps the last rows that hold text", () => {
    expect(screenTail(["", "a", "b  ", "", "c", "", ""], 3)).toEqual(["b", "", "c"]);
  });

  it("drops blank rows at the top of the tail", () => {
    expect(screenTail(["a", "", "", "b"], 3)).toEqual(["b"]);
  });

  it("returns nothing for an empty screen", () => {
    expect(screenTail(["", "  "])).toEqual([]);
  });
});
