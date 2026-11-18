import { describe, expect, it } from "vitest";
import { permissionModeOnScreen } from "./permissionMode.ts";

const screen = (...footer: string[]) => [...Array.from({ length: 20 }, () => ""), "╭────╮", "│ >  │", "╰────╯", ...footer];

describe("permissionModeOnScreen", () => {
  it("reads the mode line under the prompt box", () => {
    expect(permissionModeOnScreen(screen("  ⏵⏵ bypass permissions on (shift+tab to cycle)"))).toBe("bypassPermissions");
    expect(permissionModeOnScreen(screen("  ⏵⏵ auto mode on (shift+tab to cycle)"))).toBe("auto");
    expect(permissionModeOnScreen(screen("  ⏵⏵ auto-accept edits on (shift+tab to cycle)"))).toBe("acceptEdits");
    expect(permissionModeOnScreen(screen("  ⏸ plan mode on (shift+tab to cycle)"))).toBe("plan");
  });

  it("reads default mode from the shortcuts hint", () => {
    expect(permissionModeOnScreen(screen("  ? for shortcuts"))).toBe("default");
  });

  it("ignores conversation text above the footer", () => {
    const lines = ["bypass permissions on", ...Array.from({ length: 10 }, () => "")];
    expect(permissionModeOnScreen(lines)).toBeNull();
  });
});
