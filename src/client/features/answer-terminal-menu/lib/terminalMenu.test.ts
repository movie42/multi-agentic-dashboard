import { describe, expect, it } from "vitest";
import { keysToPick, terminalMenu } from "./terminalMenu";

describe("terminalMenu", () => {
  it("reads the folder trust choice", () => {
    const screen = [
      "Claude Code'll be able to read, edit, and execute files here.",
      "",
      "Security guide",
      "",
      "❯ No, exit",
      "  Yes, I trust this folder",
      "",
      "Enter to confirm · Esc to cancel",
    ];
    expect(terminalMenu(screen)).toEqual({ options: ["No, exit", "Yes, I trust this folder"], cursor: 0 });
  });

  it("skips description rows and strips a box frame", () => {
    const screen = [
      "│ Do you want to proceed?        │",
      "│   1. Yes                       │",
      "│ ❯ 2. Yes, and don't ask again  │",
      "│        for this folder         │",
      "│   3. No                        │",
      "│                                │",
    ];
    expect(terminalMenu(screen)).toEqual({ options: ["1. Yes", "2. Yes, and don't ask again", "3. No"], cursor: 1 });
  });

  it("does not take the prompt line for a menu", () => {
    expect(terminalMenu(["────────", "❯ hello", "────────"])).toBeNull();
  });
});

describe("keysToPick", () => {
  it("moves from the cursor and confirms", () => {
    const menu = { options: ["a", "b", "c"], cursor: 1 };
    expect(keysToPick(menu, 0)).toEqual(["up", "enter"]);
    expect(keysToPick(menu, 1)).toEqual(["enter"]);
    expect(keysToPick(menu, 2)).toEqual(["down", "enter"]);
  });
});
