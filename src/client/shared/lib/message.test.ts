import { describe, expect, it } from "vitest";
import { parseMessage, PREVIEW_LIMIT } from "./message";

describe("parseMessage", () => {
  it("returns null for empty text", () => {
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage("   ")).toBeNull();
  });

  it("splits the lead paragraph from the rest", () => {
    expect(parseMessage("\n\nFirst line\nsecond line\n\n- item\n- item2")).toEqual({
      lead: "First line\nsecond line",
      rest: "- item\n- item2",
      isPreview: false,
    });
  });

  it("keeps everything as lead when the text starts with a block", () => {
    expect(parseMessage("- a\n- b")).toEqual({ lead: "- a\n- b", rest: "", isPreview: false });
  });

  it("restores line breaks in a one-line preview", () => {
    const parsed = parseMessage("끝났어요. - 첫째 - 둘째");
    expect(parsed).toEqual({ lead: "끝났어요.", rest: "- 첫째 - 둘째", isPreview: true });
    expect(parseMessage("x".repeat(PREVIEW_LIMIT + 1))?.isPreview).toBe(false);
  });
});
