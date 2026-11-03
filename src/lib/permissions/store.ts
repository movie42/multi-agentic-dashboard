import { randomUUID } from "node:crypto";
import type {
  PendingPermission,
  PermissionAnswer,
  PermissionHookInput,
  PermissionHookOutput,
  PermissionSuggestion,
} from "./types";

const PRESENCE_MS = 10_000;
export const HOLD_MS = 590_000;

interface HeldRequest {
  request: PendingPermission;
  settle: (output: PermissionHookOutput) => void;
}

interface PermissionState {
  held: Map<string, HeldRequest>;
  lastBoardAt: number;
}

const globalState = globalThis as typeof globalThis & { __agentControlPermissions?: PermissionState };
globalState.__agentControlPermissions ??= { held: new Map(), lastBoardAt: 0 };
const state = globalState.__agentControlPermissions;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSuggestion(value: unknown): value is PermissionSuggestion {
  if (!isRecord(value) || typeof value.destination !== "string") return false;
  if (value.type === "addRules") return Array.isArray(value.rules) && typeof value.behavior === "string";
  if (value.type === "addDirectories") return Array.isArray(value.directories);
  if (value.type === "setMode") return typeof value.mode === "string";
  return false;
}

export function isPermissionHookInput(value: unknown): value is PermissionHookInput {
  return (
    isRecord(value) &&
    value.hook_event_name === "PermissionRequest" &&
    typeof value.tool_name === "string" &&
    isRecord(value.tool_input) &&
    typeof value.session_id === "string"
  );
}

export function markBoardSeen(now = Date.now()): void {
  state.lastBoardAt = now;
}

export function isDashboardOpen(now = Date.now()): boolean {
  return now - state.lastBoardAt < PRESENCE_MS;
}

export function holdPermission(paneKey: string, input: PermissionHookInput): {
  request: PendingPermission;
  result: Promise<PermissionHookOutput>;
} {
  const request: PendingPermission = {
    id: randomUUID(),
    paneKey,
    receivedAt: Date.now(),
    toolName: input.tool_name,
    toolInput: input.tool_input,
    suggestions: (input.permission_suggestions ?? []).filter(isSuggestion),
    transcriptPath: typeof input.transcript_path === "string" ? input.transcript_path : "",
  };
  const result = new Promise<PermissionHookOutput>((resolve) => {
    state.held.set(request.id, { request, settle: resolve });
  });
  return { request, result };
}

export function releasePermission(id: string, output: PermissionHookOutput = {}): boolean {
  const held = state.held.get(id);
  if (!held) return false;
  state.held.delete(id);
  held.settle(output);
  return true;
}

export function answerPermission(id: string, answer: PermissionAnswer): boolean {
  const held = state.held.get(id);
  if (!held) return false;
  if (answer.behavior === "deny") {
    return releasePermission(id, {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "deny", message: answer.message },
      },
    });
  }
  const suggestion = answer.suggestionIndex === null ? null : held.request.suggestions[answer.suggestionIndex];
  if (answer.suggestionIndex !== null && !suggestion) return false;
  return releasePermission(id, {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: suggestion ? { behavior: "allow", updatedPermissions: [suggestion] } : { behavior: "allow" },
    },
  });
}

export function pendingByPane(): Map<string, PendingPermission> {
  const byPane = new Map<string, PendingPermission>();
  for (const { request } of state.held.values()) {
    const current = byPane.get(request.paneKey);
    if (!current || current.receivedAt < request.receivedAt) byPane.set(request.paneKey, request);
  }
  return byPane;
}

export function settleStale(paneKey: string, stateName: string, stateSince: number | null): void {
  if (stateName === "waiting" || stateName === "blocked" || stateSince === null) return;
  for (const { request } of [...state.held.values()]) {
    if (request.paneKey === paneKey && stateSince > request.receivedAt) releasePermission(request.id);
  }
}
