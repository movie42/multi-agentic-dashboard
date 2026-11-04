import { queryOptions } from "@tanstack/react-query";
import type { ActivityResponse, ActivityStep, SessionSummary, SessionsResponse } from "@/common/sessions/types";

export const ACTIVITY_POLL_MS = 2000;

export interface SessionList {
  sessions: SessionSummary[];
  scannedAt: number;
}

export const sessionKeys = {
  all: ["sessions"] as const,
  list: () => [...sessionKeys.all, "list"] as const,
  activity: (sessionId: string) => [...sessionKeys.all, "activity", sessionId] as const,
};

async function fetchSessions(signal: AbortSignal): Promise<SessionList> {
  const response = await fetch("/api/sessions", { cache: "no-store", signal });
  const payload = (await response.json()) as SessionsResponse;
  if (!payload.ok) throw new Error(payload.error);
  return { sessions: payload.sessions, scannedAt: payload.scannedAt };
}

async function fetchActivity(sessionId: string, signal: AbortSignal): Promise<ActivityStep[]> {
  const response = await fetch(`/api/activity?session=${encodeURIComponent(sessionId)}`, { cache: "no-store", signal });
  const payload = (await response.json()) as ActivityResponse;
  if (!payload.ok) throw new Error(payload.error);
  return payload.steps;
}

export function sessionListQueryOptions() {
  return queryOptions({
    queryKey: sessionKeys.list(),
    queryFn: ({ signal }) => fetchSessions(signal),
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function activityQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: sessionKeys.activity(sessionId),
    queryFn: ({ signal }) => fetchActivity(sessionId, signal),
    refetchInterval: ACTIVITY_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
