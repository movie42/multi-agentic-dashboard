const MODE_LABEL: Record<string, string> = {
  bypassPermissions: "bypass",
  auto: "auto",
  acceptEdits: "accept edits",
  plan: "plan",
  dontAsk: "don't ask",
  default: "default",
};

/** Short name for Claude Code's permission mode, as its own mode line spells it. */
export function permissionModeLabel(mode: string | null): string | null {
  if (!mode) return null;
  return MODE_LABEL[mode] ?? mode;
}
