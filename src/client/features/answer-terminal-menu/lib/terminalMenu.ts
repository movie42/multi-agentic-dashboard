import type { TerminalKey } from "@/common/actions/schema";
import type { TerminalMenu } from "@/common/terminal/menu";

/** Arrow presses from the cursor to an option, then Enter. */
export function keysToPick(menu: TerminalMenu, index: number): TerminalKey[] {
  const moves = index - menu.cursor;
  return [...Array<TerminalKey>(Math.abs(moves)).fill(moves > 0 ? "down" : "up"), "enter"];
}
