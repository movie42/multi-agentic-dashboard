import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// The desktop app starts without the login shell's PATH, so the usual install places are tried.
export const CLAUDE_BIN =
  process.env.CLAUDE_BIN ??
  [path.join(homedir(), ".local", "bin", "claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find((file) =>
    existsSync(file),
  ) ??
  "claude";
