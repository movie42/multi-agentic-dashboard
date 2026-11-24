import { describe, expect, it } from "vitest";
import { sessionWindowHref } from "./sessionWindow";

describe("sessionWindowHref", () => {
  it("points a session window at the session id", () => {
    expect(sessionWindowHref("abc 1")).toBe("/session?id=abc+1");
  });
});
