import type { RunnerPermission, RunnerPermissionAnswer, RunnerPermissionSuggestion } from "../../src/common/runner/types.ts";

export const PERMISSION_HOLD_MS = 590_000;
export const ASK_USER_QUESTION = "AskUserQuestion";
export const DENIED_MESSAGE = "The user denied this from the Agent Control dashboard.";

export type PermissionDecision =
  | { behavior: "allow"; updatedPermissions?: RunnerPermissionSuggestion[] }
  | { behavior: "deny"; message: string };

export interface PermissionHookOutput {
  hookSpecificOutput?: { hookEventName: "PermissionRequest"; decision: PermissionDecision };
}

export interface PermissionRequestInput {
  toolName: string;
  toolInput: Record<string, unknown>;
  suggestions: RunnerPermissionSuggestion[];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

export function permissionInputOf(body: unknown): PermissionRequestInput | null {
  const raw = record(body);
  const toolName = raw?.tool_name;
  const toolInput = record(raw?.tool_input);
  if (typeof toolName !== "string" || !toolInput || toolName === ASK_USER_QUESTION) return null;
  const suggestions = Array.isArray(raw?.permission_suggestions)
    ? raw.permission_suggestions.flatMap((item: unknown) => {
        const suggestion = record(item);
        return suggestion && typeof suggestion.type === "string" ? [suggestion] : [];
      })
    : [];
  return { toolName, toolInput, suggestions };
}

export function decisionFor(permission: RunnerPermission, answer: RunnerPermissionAnswer): PermissionDecision | null {
  if (answer.behavior === "deny") return { behavior: "deny", message: answer.message };
  if (answer.suggestionIndex === null) return { behavior: "allow" };
  const suggestion = permission.suggestions[answer.suggestionIndex];
  return suggestion ? { behavior: "allow", updatedPermissions: [suggestion] } : null;
}

export function hookOutput(decision: PermissionDecision): PermissionHookOutput {
  return { hookSpecificOutput: { hookEventName: "PermissionRequest", decision } };
}

export function answerOf(body: unknown): { requestId: string; answer: RunnerPermissionAnswer } | null {
  const raw = record(body);
  const requestId = raw?.requestId;
  const answer = record(raw?.answer);
  if (typeof requestId !== "string" || !answer) return null;
  if (answer.behavior === "deny") {
    return { requestId, answer: { behavior: "deny", message: typeof answer.message === "string" && answer.message.trim() ? answer.message : DENIED_MESSAGE } };
  }
  if (answer.behavior !== "allow") return null;
  const index = answer.suggestionIndex;
  if (index !== null && !(typeof index === "number" && Number.isInteger(index) && index >= 0)) return null;
  return { requestId, answer: { behavior: "allow", suggestionIndex: index } };
}
