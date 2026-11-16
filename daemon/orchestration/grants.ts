import type { Conductor, DelegatedRule, GrantBundle } from "../../src/common/orchestration/types.ts";
import { ASK_USER_QUESTION } from "../../src/common/runner/questions.ts";
import type { PermissionRequestInput } from "../session/permissions.ts";

const EDIT_TOOLS: ReadonlySet<string> = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/** Chaining, substitution and redirection let one approved prefix run anything, so such commands never match. */
const COMPOUND = /[;&|`<>\n]|\$\(/;
const NEVER = /\bgit\s+push\b|\brm\s+-[a-z]*r|\bsudo\b/;

const BUILD = [
  /^(bun|npm|pnpm|yarn)\s+(run\s+)?(test|build|lint|typecheck|check)(\s|$)/,
  /^(bunx|npx|pnpm\s+exec|yarn)\s+(tsc|vitest|jest|eslint|prettier|playwright\s+test)(\s|$)/,
  /^(tsc|vitest|jest|eslint)(\s|$)/,
  /^(bun|node)\s+test(\s|$)/,
];
const COMMIT = [/^git\s+(add|commit|status|diff|log|show)(\s|$)/];

function commandOf(input: PermissionRequestInput): string | null {
  const command = input.toolInput.command;
  return input.toolName === "Bash" && typeof command === "string" ? command.trim() : null;
}

function safeCommand(command: string): boolean {
  return !COMPOUND.test(command) && !NEVER.test(command);
}

export function bundleCovers(bundle: GrantBundle, input: PermissionRequestInput): boolean {
  if (bundle === "edit") return EDIT_TOOLS.has(input.toolName);
  const command = commandOf(input);
  if (!command || !safeCommand(command)) return false;
  return (bundle === "build" ? BUILD : COMMIT).some((pattern) => pattern.test(command));
}

export function ruleCovers(rule: DelegatedRule, input: PermissionRequestInput): boolean {
  if (rule.toolName !== input.toolName) return false;
  if (rule.toolName !== "Bash") return true;
  const command = commandOf(input);
  if (!command || !safeCommand(command)) return false;
  return rule.prefix === null || command === rule.prefix || command.startsWith(`${rule.prefix} `);
}

/** Whether a worker's permission request falls inside what a person handed its conductor. */
export function isDelegated(conductor: Conductor, input: PermissionRequestInput): boolean {
  if (input.toolName === ASK_USER_QUESTION) return false;
  return conductor.grants.some((bundle) => bundleCovers(bundle, input)) || conductor.rules.some((rule) => ruleCovers(rule, input));
}

/** The rule "앞으로 지휘자에게 맡기기" adds for this request: Bash keeps its first two words, other tools the whole tool. */
export function ruleFor(input: PermissionRequestInput): DelegatedRule | null {
  if (input.toolName === ASK_USER_QUESTION) return null;
  if (input.toolName !== "Bash") return { toolName: input.toolName, prefix: null };
  const command = commandOf(input);
  if (!command || !safeCommand(command)) return null;
  const prefix = command.split(/\s+/).slice(0, 2).join(" ");
  return prefix ? { toolName: "Bash", prefix } : null;
}

export function describePermission(input: PermissionRequestInput): string {
  const command = commandOf(input);
  if (command) return `Bash: ${command}`;
  const file = input.toolInput.file_path ?? input.toolInput.notebook_path ?? input.toolInput.path;
  return typeof file === "string" ? `${input.toolName}: ${file}` : `${input.toolName}: ${JSON.stringify(input.toolInput).slice(0, 400)}`;
}
