import type { AppStatus, AppStatusAction, AppStatusResponse } from "@/common/appStatus/types";
import { readJson } from "@/client/shared/api/json";

export const appStatusKey = ["app-status"] as const;
export const APP_STATUS_POLL_MS = 15_000;
export const APP_STATUS_BUSY_POLL_MS = 2000;

export async function fetchAppStatus(): Promise<AppStatus> {
  const payload = await readJson<AppStatusResponse>(await fetch("/api/app-status"));
  if (!payload.ok) throw new Error(payload.error);
  return payload.status;
}

export async function postAppStatus(action: AppStatusAction): Promise<AppStatus> {
  const response = await fetch("/api/app-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  const payload = await readJson<AppStatusResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload.status;
}
