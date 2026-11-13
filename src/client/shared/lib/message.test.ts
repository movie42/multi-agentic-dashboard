import { describe, expect, it } from "vitest";
import { parseMessage } from "./message";

describe("parseMessage", () => {
  it("returns null for empty text", () => {
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage("   ")).toBeNull();
  });

  it("splits the lead paragraph from the rest", () => {
    expect(parseMessage("\n\nFirst line\nsecond line\n\n- item\n- item2")).toEqual({
      lead: "First line\nsecond line",
      rest: "- item\n- item2",
    });
  });

  it("keeps everything as lead when the text starts with a block", () => {
    expect(parseMessage("- a\n- b")).toEqual({ lead: "- a\n- b", rest: "" });
  });
});
