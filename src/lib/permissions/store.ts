import type { PermissionAnswer, PermissionHookInput } from "@/common/permissions/schema";
import { services } from "@/server/container";
import type { PendingPermission, PermissionHookOutput } from "./types";

export { HOLD_MS } from "@/server/permissions/PermissionStore";

export function markBoardSeen(): void {
  services().permissions.markBoardSeen();
}

export function isDashboardOpen(): boolean {
  return services().permissions.isDashboardOpen();
}

export function holdPermission(
  paneKey: string,
  input: PermissionHookInput,
): { request: PendingPermission; result: Promise<PermissionHookOutput> } {
  return services().permissions.hold(paneKey, input);
}

export function releasePermission(id: string, output: PermissionHookOutput = {}): boolean {
  return services().permissions.release(id, output);
}

export function answerPermission(id: string, answer: PermissionAnswer): boolean {
  return services().permissions.answer(id, answer);
}

export function pendingByPane(): Map<string, PendingPermission> {
  return services().permissions.pendingByPane();
}

export function settleStale(paneKey: string, stateName: string, stateSince: number | null): void {
  services().permissions.settleStale(paneKey, stateName, stateSince);
}
