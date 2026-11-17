"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchScreen } from "../api/runnerApi";
import { screenTail } from "../lib/screenTail";

const SCREEN_POLL_MS = 2_000;

export const terminalScreenKey = (sessionId: string) => ["runner", "screen", sessionId] as const;

/** The last text rows of a session's terminal screen, polled. */
export function useTerminalScreen(sessionId: string): string[] {
  const screen = useQuery({
    queryKey: terminalScreenKey(sessionId),
    queryFn: () => fetchScreen(sessionId),
    refetchInterval: SCREEN_POLL_MS,
    staleTime: 0,
  });
  return screenTail(screen.data ?? []);
}
