export const SCREEN_TAIL_LINES = 14;

/** The last rows of a terminal screen that hold text, as the terminal drew them. */
export function screenTail(lines: string[], max = SCREEN_TAIL_LINES): string[] {
  const trimmed = lines.map((line) => line.trimEnd());
  const end = trimmed.findLastIndex((line) => line !== "") + 1;
  const tail = trimmed.slice(Math.max(0, end - max), end);
  const start = tail.findIndex((line) => line !== "");
  return start < 0 ? [] : tail.slice(start);
}
