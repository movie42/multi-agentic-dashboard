import { describe, expect, it } from "vitest";
import { terminalMenu } from "./menu";

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

  it("does not take a multi-line message in the prompt box for a menu", () => {
    expect(terminalMenu(["────────", "❯ first line", "  second line", "────────"])).toBeNull();
  });

  it("does not take a list quoted above an empty prompt for a menu", () => {
    expect(terminalMenu(["  ❯ 1. Yes", "    2. No", "", "────────", "❯ ", "────────"])).toBeNull();
  });
});
