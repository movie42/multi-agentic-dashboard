import { describe, expect, it } from "vitest";
import { opensTerminalDialog } from "./terminalDialog";

describe("opensTerminalDialog", () => {
  it.each([
    ["/resume", false],
    ["/mcp", true],
    ["  /mcp  ", true],
    ["/model", true],
    ["/model opus", false],
    ["/flow start", false],
    ["resume the work", false],
    ["/compact", false],
  ])("%s → %s", (message, expected) => {
    expect(opensTerminalDialog(message)).toBe(expected);
  });
});
