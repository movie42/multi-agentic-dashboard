import { describe, expect, it } from "vitest";
import { actionText, parseActionText } from "./actionText.ts";

describe("actionText", () => {
  it("round-trips an action through the message text", () => {
    const action = { surfaceId: "pick", name: "choose", context: { choice: "A안", note: "줄\n바꿈" } };
    const text = actionText(action);
    expect(text.startsWith("[A2UI action] surface=pick name=choose")).toBe(true);
    expect(parseActionText(text)).toEqual(action);
  });

  it("omits the context line when it is empty", () => {
    expect(actionText({ surfaceId: "s", name: "ok", context: {} })).toBe("[A2UI action] surface=s name=ok");
    expect(parseActionText("[A2UI action] surface=s name=ok")).toEqual({ surfaceId: "s", name: "ok", context: {} });
  });

  it("ignores ordinary prompts", () => {
    expect(parseActionText("그냥 메시지")).toBeNull();
  });
});
