import { queryOptions } from "@tanstack/react-query";
import type { TerminalScreen, TerminalScreenResponse } from "@/common/orca/screen";
import { readJson } from "@/client/shared/api/json";

export const TERMINAL_POLL_MS = 2000;

export const terminalKeys = {
  all: ["terminal"] as const,
  screen: (terminalHandle: string) => [...terminalKeys.all, "screen", terminalHandle] as const,
};

async function fetchScreen(terminalHandle: string, signal: AbortSignal): Promise<TerminalScreen> {
  const response = await fetch(`/api/terminal?handle=${encodeURIComponent(terminalHandle)}`, { cache: "no-store", signal });
  const payload = await readJson<TerminalScreenResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload.screen;
}

export function terminalScreenQueryOptions(terminalHandle: string) {
  return queryOptions({
    queryKey: terminalKeys.screen(terminalHandle),
    queryFn: ({ signal }) => fetchScreen(terminalHandle, signal),
    refetchInterval: TERMINAL_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
