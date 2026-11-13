// Installs or removes the skills Agent Control relies on (skills/*) in ~/.claude/skills. Each skill
// is copied rather than linked so it keeps working when this checkout or worktree is deleted.
import { cpSync, existsSync, lstatSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");
const TARGET = process.env.CLAUDE_SKILLS_DIR ?? path.join(homedir(), ".claude", "skills");
const uninstall = process.argv.includes("--uninstall");

const names = readdirSync(SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(SOURCE, entry.name, "SKILL.md")))
  .map((entry) => entry.name);

const MARKER = ".installed-by-agent-control";
const RETIRED = ["orca-worktree"];

function isPresent(target) {
  try {
    lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function isOurs(target) {
  return !lstatSync(target).isSymbolicLink() && existsSync(path.join(target, MARKER));
}

for (const name of names) {
  const target = path.join(TARGET, name);
  const present = isPresent(target);
  if (present && !isOurs(target)) {
    console.warn(`skipped skill ${target}: it was not installed by this script, so it is left alone. Remove it yourself to let this script manage it.`);
    continue;
  }
  if (uninstall) {
    if (present) rmSync(target, { recursive: true, force: true });
    console.log(`removed skill ${target}`);
    continue;
  }
  const staging = `${target}.installing`;
  rmSync(staging, { recursive: true, force: true });
  cpSync(path.join(SOURCE, name), staging, { recursive: true });
  writeFileSync(path.join(staging, MARKER), "");
  if (present) rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
  console.log(`installed skill ${target}`);
}

for (const name of RETIRED) {
  const target = path.join(TARGET, name);
  if (!isPresent(target) || !isOurs(target)) continue;
  rmSync(target, { recursive: true, force: true });
  console.log(`removed retired skill ${target}`);
}
