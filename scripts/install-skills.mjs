// Installs or removes the skills Agent Control relies on (skills/*) in ~/.claude/skills. Each skill
// is copied rather than linked so it keeps working when this checkout or worktree is deleted.
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");
const TARGET = process.env.CLAUDE_SKILLS_DIR ?? path.join(homedir(), ".claude", "skills");
const uninstall = process.argv.includes("--uninstall");

const names = readdirSync(SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(SOURCE, entry.name, "SKILL.md")))
  .map((entry) => entry.name);

for (const name of names) {
  const target = path.join(TARGET, name);
  rmSync(target, { recursive: true, force: true });
  if (!uninstall) cpSync(path.join(SOURCE, name), target, { recursive: true });
  console.log(`${uninstall ? "removed" : "installed"} skill ${target}`);
}
