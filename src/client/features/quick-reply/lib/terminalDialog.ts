// Claude Code slash commands that answer with a picker or dialog drawn only in the terminal.
// The transcript records nothing until the dialog closes, so the chat view cannot show it.
const ALWAYS: ReadonlySet<string> = new Set([
  "agents",
  "allowed-tools",
  "bashes",
  "bug",
  "checkpoint",
  "config",
  "doctor",
  "feedback",
  "help",
  "hooks",
  "ide",
  "install-github-app",
  "login",
  "mcp",
  "memory",
  "permissions",
  "plugin",
  "plugins",
  "privacy-settings",
  "rewind",
  "sandbox",
  "settings",
  "skills",
  "status",
  "tasks",
  "terminal-setup",
  "theme",
  "usage",
]);

// These run directly when given an argument (`/model opus`) and open a picker without one.
const WITHOUT_ARGS: ReadonlySet<string> = new Set(["add-dir", "effort", "export", "fast", "model", "output-style"]);

/** A bare `/resume` gets the in-chat picker; `/resume <id>` switches without a dialog. */
export function isResumePicker(message: string): boolean {
  return message.trim() === "/resume";
}

export function opensTerminalDialog(message: string): boolean {
  const match = message.trim().match(/^\/([\w:-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return false;
  const name = match[1] ?? "";
  const hasArgs = Boolean(match[2]?.trim());
  return ALWAYS.has(name) || (!hasArgs && WITHOUT_ARGS.has(name));
}
