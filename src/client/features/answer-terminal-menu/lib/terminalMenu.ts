import type { TerminalKey } from "@/common/actions/schema";

export interface TerminalMenu {
  options: string[];
  /** Index of the option the terminal cursor (❯) is on. */
  cursor: number;
}

const FRAME = /^\s*│|│\s*$/g;
const CURSOR_LINE = /^(\s*)[❯›](\s+)(\S.*)$/;
const indentOf = (line: string) => line.length - line.trimStart().length;

/**
 * A choice list Claude Code draws only in the terminal (folder trust, a picker), read off the
 * screen: the row marked ❯ and the rows at the same indent around it. Deeper rows are option
 * descriptions; a blank or shallower row ends the list. Fewer than two options is not a menu.
 */
export function terminalMenu(screen: string[]): TerminalMenu | null {
  const lines = screen.map((line) => line.replace(FRAME, "").trimEnd());
  const at = lines.findLastIndex((line) => CURSOR_LINE.test(line));
  const match = at < 0 ? null : CURSOR_LINE.exec(lines[at] ?? "");
  if (!match) return null;
  const column = (match[1] ?? "").length + 1 + (match[2] ?? "").length;
  const collect = (step: 1 | -1): string[] => {
    const found: string[] = [];
    // eslint-disable-next-line no-restricted-syntax -- walk outward from the cursor row until the list ends
    for (let index = at + step; index >= 0 && index < lines.length; index += step) {
      const line = lines[index] ?? "";
      if (line.trim() === "" || indentOf(line) < column) break;
      if (indentOf(line) === column) found.push(line.trim());
    }
    return found;
  };
  const above = collect(-1).reverse();
  const options = [...above, (match[3] ?? "").trim(), ...collect(1)];
  return options.length < 2 ? null : { options, cursor: above.length };
}

/** Arrow presses from the cursor to an option, then Enter. */
export function keysToPick(menu: TerminalMenu, index: number): TerminalKey[] {
  const moves = index - menu.cursor;
  return [...Array<TerminalKey>(Math.abs(moves)).fill(moves > 0 ? "down" : "up"), "enter"];
}
