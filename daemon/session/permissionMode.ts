// Claude Code shows the active mode in the line under its prompt box, e.g.
// "⏵⏵ bypass permissions on (shift+tab to cycle)". Default mode shows no such line, only the
// "? for shortcuts" hint while the input is empty. Shift+Tab fires no hook, so this is the only trace.
const MODE_LINES: readonly [RegExp, string][] = [
  [/bypass permissions on/i, "bypassPermissions"],
  [/accept edits on/i, "acceptEdits"],
  [/plan mode on/i, "plan"],
  [/auto mode on/i, "auto"],
  [/don'?t ask on/i, "dontAsk"],
  [/\? for shortcuts/, "default"],
];
const FOOTER_ROWS = 6;

export function permissionModeOnScreen(lines: readonly string[]): string | null {
  const footer = lines.slice(-FOOTER_ROWS).reverse();
  return footer.flatMap((line) => MODE_LINES.filter(([pattern]) => pattern.test(line)).map(([, mode]) => mode))[0] ?? null;
}
