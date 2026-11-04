import "server-only";
import { randomUUID } from "node:crypto";
import { suggestionsOf, type PermissionAnswer, type PermissionHookInput } from "@/common/permissions/schema";
import { questionsOf } from "@/common/permissions/questions";
import type { PendingPermission, PermissionHookDecision, PermissionHookOutput } from "@/common/permissions/types";

export const PRESENCE_MS = 10_000;
export const HOLD_MS = 590_000;

interface HeldRequest {
  request: PendingPermission;
  settle: (output: PermissionHookOutput) => void;
}

function decide(decision: PermissionHookDecision): PermissionHookOutput {
  return { hookSpecificOutput: { hookEventName: "PermissionRequest", decision } };
}

export function decisionFor(request: PendingPermission, answer: PermissionAnswer): PermissionHookDecision | null {
  if (answer.behavior === "deny") return { behavior: "deny", message: answer.message };
  if (answer.behavior === "answer") {
    const asked = new Set(questionsOf(request.toolInput).map((question) => question.question));
    const keys = Object.keys(answer.answers);
    if (asked.size === 0 || keys.length === 0 || keys.some((key) => !asked.has(key))) return null;
    return { behavior: "allow", updatedInput: { ...request.toolInput, answers: answer.answers } };
  }
  if (answer.suggestionIndex === null) return { behavior: "allow" };
  const suggestion = request.suggestions[answer.suggestionIndex];
  return suggestion ? { behavior: "allow", updatedPermissions: [suggestion] } : null;
}

export class PermissionStore {
  private readonly held = new Map<string, HeldRequest>();
  private lastBoardAt = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = randomUUID,
  ) {}

  markBoardSeen(): void {
    this.lastBoardAt = this.now();
  }

  isDashboardOpen(): boolean {
    return this.now() - this.lastBoardAt < PRESENCE_MS;
  }

  hold(paneKey: string, input: PermissionHookInput): { request: PendingPermission; result: Promise<PermissionHookOutput> } {
    const request: PendingPermission = {
      id: this.newId(),
      paneKey,
      receivedAt: this.now(),
      toolName: input.tool_name,
      toolInput: input.tool_input,
      suggestions: suggestionsOf(input.permission_suggestions),
      transcriptPath: input.transcript_path,
    };
    const result = new Promise<PermissionHookOutput>((resolve) => {
      this.held.set(request.id, { request, settle: resolve });
    });
    return { request, result };
  }

  release(id: string, output: PermissionHookOutput = {}): boolean {
    const held = this.held.get(id);
    if (!held) return false;
    this.held.delete(id);
    held.settle(output);
    return true;
  }

  answer(id: string, answer: PermissionAnswer): boolean {
    const held = this.held.get(id);
    if (!held) return false;
    const decision = decisionFor(held.request, answer);
    return decision ? this.release(id, decide(decision)) : false;
  }

  pendingByPane(): Map<string, PendingPermission> {
    const newestFirst = [...this.held.values()]
      .map(({ request }) => request)
      .sort((a, b) => b.receivedAt - a.receivedAt);
    return newestFirst.reduce(
      (byPane, request) => (byPane.has(request.paneKey) ? byPane : byPane.set(request.paneKey, request)),
      new Map<string, PendingPermission>(),
    );
  }

  settleStale(paneKey: string, stateName: string, stateSince: number | null): void {
    if (stateName === "waiting" || stateName === "blocked" || stateSince === null) return;
    [...this.held.values()]
      .filter(({ request }) => request.paneKey === paneKey && stateSince > request.receivedAt)
      .forEach(({ request }) => this.release(request.id));
  }
}
