import { queryOptions } from "@tanstack/react-query";
import type { ActivityResponse, ActivityStep, ConversationResponse, ConversationTurn, SessionSummary, SessionsResponse } from "@/common/sessions/types";
import { readJson } from "@/client/shared/api/json";

export const ACTIVITY_POLL_MS = 2000;

export interface SessionList {
  sessions: SessionSummary[];
  scannedAt: number;
}

export const sessionKeys = {
  all: ["sessions"] as const,
  list: () => [...sessionKeys.all, "list"] as const,
  activity: (sessionId: string) => [...sessionKeys.all, "activity", sessionId] as const,
  conversation: (sessionId: string) => [...sessionKeys.all, "conversation", sessionId] as const,
};

async function fetchSessions(signal: AbortSignal): Promise<SessionList> {
  const response = await fetch("/api/sessions", { cache: "no-store", signal });
  const payload = await readJson<SessionsResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return { sessions: payload.sessions, scannedAt: payload.scannedAt };
}

async function fetchActivity(sessionId: string, signal: AbortSignal): Promise<ActivityStep[]> {
  const response = await fetch(`/api/activity?session=${encodeURIComponent(sessionId)}`, { cache: "no-store", signal });
  const payload = await readJson<ActivityResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload.steps;
}

async function fetchConversation(sessionId: string, signal: AbortSignal): Promise<ConversationTurn[]> {
  const response = await fetch(`/api/conversation?session=${encodeURIComponent(sessionId)}`, { cache: "no-store", signal });
  const payload = await readJson<ConversationResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload.turns;
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

export function conversationQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: sessionKeys.conversation(sessionId),
    queryFn: ({ signal }) => fetchConversation(sessionId, signal),
    refetchInterval: ACTIVITY_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
