import { queryOptions } from "@tanstack/react-query";
import type { UsageResponse, UsageSnapshot } from "@/common/usage/types";
import { readJson } from "@/client/shared/api/json";

export const USAGE_POLL_MS = 30_000;

export const usageKeys = {
  all: ["usage"] as const,
};

async function requestUsage(signal: AbortSignal): Promise<UsageSnapshot> {
  const response = await fetch("/api/usage", { cache: "no-store", signal });
  const payload = await readJson<UsageResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload;
}

export function usageQueryOptions() {
  return queryOptions({
    queryKey: usageKeys.all,
    queryFn: ({ signal }) =>
      requestUsage(signal).catch((pollError: unknown) => {
        if (!signal.aborted) console.error("[usage] poll failed", pollError);
        throw pollError;
      }),
    refetchInterval: USAGE_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
