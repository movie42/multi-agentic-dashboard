// Installs or removes the PostToolUse hook that records the working tree after each tool call
// (scripts/snapshot-hook.mjs). The script is copied under ~/.claude/hooks so the hook keeps
// working when this checkout or worktree is deleted.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SETTINGS = process.env.CLAUDE_SETTINGS_FILE ?? path.join(homedir(), ".claude", "settings.json");
const HOOK_FILE = path.join(homedir(), ".claude", "hooks", "agent-snapshot-hook.mjs");
const SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "snapshot-hook.mjs");
const MATCHER = "Edit|Write|MultiEdit|NotebookEdit|Bash";

const uninstall = process.argv.includes("--uninstall");

const settings = existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, "utf8")) : {};
const hooks = settings.hooks ?? {};
const groups = Array.isArray(hooks.PostToolUse) ? hooks.PostToolUse : [];

const isOurs = (hook) => hook?.type === "command" && typeof hook.command === "string" && hook.command.includes(path.basename(HOOK_FILE));
const kept = groups
  .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((hook) => !isOurs(hook)) }))
  .filter((group) => group.hooks.length > 0);

if (uninstall) {
  rmSync(HOOK_FILE, { force: true });
} else {
  mkdirSync(path.dirname(HOOK_FILE), { recursive: true });
  copyFileSync(SOURCE, HOOK_FILE);
  kept.push({
    matcher: MATCHER,
    hooks: [{ type: "command", command: `node "${HOOK_FILE}"`, timeout: 10 }],
  });
}

if (kept.length > 0) hooks.PostToolUse = kept;
else delete hooks.PostToolUse;
if (Object.keys(hooks).length > 0) settings.hooks = hooks;
else delete settings.hooks;

if (existsSync(SETTINGS)) {
  const backup = `${SETTINGS}.bak-${Date.now()}`;
  copyFileSync(SETTINGS, backup);
  console.log(`backup ${backup}`);
}
writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
console.log(uninstall ? `removed snapshot hook from ${SETTINGS}` : `installed snapshot hook (${HOOK_FILE}) in ${SETTINGS}`);
