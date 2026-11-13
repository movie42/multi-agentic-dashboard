import { queryOptions } from "@tanstack/react-query";
import type { UsageResponse, UsageSnapshot } from "@/common/usage/types";
import { readJson } from "@/client/shared/api/json";

export const USAGE_POLL_MS = 5 * 60_000;

// Module state resets on a page reload, so only the first request after a reload skips the server cache.
const pageLoad = { pending: true };

export const usageKeys = {
  all: ["usage"] as const,
};

async function requestUsage(signal: AbortSignal): Promise<UsageSnapshot> {
  const url = pageLoad.pending ? "/api/usage?fresh" : "/api/usage";
  pageLoad.pending = false;
  const response = await fetch(url, { cache: "no-store", signal });
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
