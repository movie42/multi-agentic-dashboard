import { queryOptions } from "@tanstack/react-query";
import type { TokenTally, TokenTallyResponse } from "@/common/tokens/types";
import { readJson } from "@/client/shared/api/json";

/** A close from another window reaches this one on the next poll. */
export const TOKEN_POLL_MS = 10_000;

export const tokenKeys = {
  all: ["tokens"] as const,
};

async function requestTally(signal: AbortSignal): Promise<TokenTally> {
  const response = await fetch("/api/tokens", { cache: "no-store", signal });
  const payload = await readJson<TokenTallyResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return { total: payload.total };
}

export function tokenTallyQueryOptions() {
  return queryOptions({
    queryKey: tokenKeys.all,
    queryFn: ({ signal }) =>
      requestTally(signal).catch((pollError: unknown) => {
        if (!signal.aborted) console.error("[tokens] poll failed", pollError);
        throw pollError;
      }),
    refetchInterval: TOKEN_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
