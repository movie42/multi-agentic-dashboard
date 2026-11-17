export interface TerminalMenu {
  options: string[];
  /** Index of the option the terminal cursor (❯) is on. */
  cursor: number;
}

const FRAME = /^\s*│|│\s*$/g;
const CURSOR_LINE = /^(\s*)[❯›](\s+)(\S.*)$/;
const EMPTY_PROMPT = /^\s*[❯›]\s*$/;
const RULE = /^\s*[─━═]{3,}\s*$/;
const indentOf = (line: string) => line.length - line.trimStart().length;

/**
 * A choice list Claude Code draws only in the terminal (folder trust, a picker), read off the
 * screen: the row marked ❯ and the rows at the same indent around it. Deeper rows are option
 * descriptions; a blank or shallower row ends the list. Fewer than two options is not a menu.
 *
 * The prompt box is not a menu: a list that starts right under a rule is a multi-line message
 * being typed, and a list with an empty prompt below it is text quoted in the conversation.
 */
export function terminalMenu(screen: string[]): TerminalMenu | null {
  const lines = screen.map((line) => line.replace(FRAME, "").trimEnd());
  const at = lines.findLastIndex((line) => CURSOR_LINE.test(line));
  const match = at < 0 ? null : CURSOR_LINE.exec(lines[at] ?? "");
  if (!match) return null;
  if (lines.slice(at + 1).some((line) => EMPTY_PROMPT.test(line))) return null;
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
  if (RULE.test(lines[at - above.length - 1] ?? "")) return null;
  const options = [...above, (match[3] ?? "").trim(), ...collect(1)];
  return options.length < 2 ? null : { options, cursor: above.length };
}
