import path from "node:path";
import type { Conductor, GrantBundle } from "../../src/common/orchestration/types.ts";

export interface PermissionAsk {
  toolName: string;
  toolInput: Record<string, unknown>;
}

const EDIT_TOOLS: ReadonlySet<string> = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const TEST_COMMAND = /^(?:(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?(?:test|lint|typecheck|build|check)\b|(?:bunx|npx|pnpm\s+exec)\s+(?:tsc|vitest|eslint|jest|playwright\s+test)\b|(?:tsc|vitest|eslint|jest)\b)/;
const COMMIT_COMMAND = /^git\s+(?:add|commit|status|diff|log|show)\b/;
/** Anything that publishes or rewrites shared history stays with a person, whatever was granted. */
const NEVER = /\bgit\s+push\b|\bgit\s+reset\s+--hard\b|\brm\s+-[a-z]*r[a-z]*f?\b/;

function commandOf(ask: PermissionAsk): string | null {
  const command = ask.toolInput.command;
  return ask.toolName === "Bash" && typeof command === "string" ? command.trim() : null;
}

function inside(file: unknown, root: string): boolean {
  if (typeof file !== "string" || !file) return false;
  const resolved = path.resolve(root, file);
  return resolved === root || resolved.startsWith(`${root}/`);
}

function matchesBundle(bundle: GrantBundle, ask: PermissionAsk, workerCwd: string): boolean {
  const command = commandOf(ask);
  switch (bundle) {
    case "edit":
      return EDIT_TOOLS.has(ask.toolName) && inside(ask.toolInput.file_path ?? ask.toolInput.notebook_path, workerCwd);
    case "test":
      return command !== null && TEST_COMMAND.test(command);
    case "commit":
      return command !== null && COMMIT_COMMAND.test(command);
  }
}

function matchesExtra(grant: string, ask: PermissionAsk): boolean {
  if (!grant.startsWith("Bash:")) return grant === ask.toolName;
  const command = commandOf(ask);
  const prefix = grant.slice("Bash:".length);
  return command !== null && (command === prefix || command.startsWith(`${prefix} `));
}

/** Whether a worker's permission request falls inside what a person handed to its conductor. */
export function isDelegated(conductor: Conductor, ask: PermissionAsk, workerCwd: string): boolean {
  const command = commandOf(ask);
  if (command !== null && (NEVER.test(command) || /[;&|`$]/.test(command))) return false;
  return conductor.grants.some((bundle) => matchesBundle(bundle, ask, workerCwd)) || conductor.extraGrants.some((grant) => matchesExtra(grant, ask));
}

/** The grant a "hand this to the conductor from now on" button adds: the tool, or the command's first two words. */
export function grantFor(ask: PermissionAsk): string | null {
  const command = commandOf(ask);
  if (command === null) return ask.toolName;
  if (NEVER.test(command)) return null;
  const words = command.split(/\s+/).slice(0, 2).join(" ");
  return words ? `Bash:${words}` : null;
}
