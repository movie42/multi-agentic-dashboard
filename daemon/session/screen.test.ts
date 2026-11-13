import { describe, expect, it } from "vitest";
import { createHeadlessScreen } from "./screen.ts";

describe("createHeadlessScreen", () => {
  it("replays control codes into the visible rows", async () => {
    const screen = createHeadlessScreen(20, 3);
    screen.write("old line\r\x1b[2Knew\r\n\x1b[31mred\x1b[0m");
    await expect(screen.lines()).resolves.toEqual(["new", "red", ""]);
    screen.dispose();
  });

  it("follows a resize", async () => {
    const screen = createHeadlessScreen(20, 3);
    screen.resize(20, 5);
    await expect(screen.lines()).resolves.toHaveLength(5);
    screen.dispose();
  });
});
