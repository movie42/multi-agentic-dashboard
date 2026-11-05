import { queryOptions } from "@tanstack/react-query";
import type { RuntimeMode, RuntimeResponse } from "@/common/orca/runtime";
import { readJson } from "@/client/shared/api/json";

export const RUNTIME_POLL_MS = 15_000;

export const runtimeKeys = {
  all: ["runtime"] as const,
};

async function requestRuntime(init?: RequestInit): Promise<RuntimeMode> {
  const response = await fetch("/api/runtime", { cache: "no-store", ...init });
  const payload = await readJson<RuntimeResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload.mode;
}

export function switchRuntime(mode: Exclude<RuntimeMode, "off">): Promise<RuntimeMode> {
  return requestRuntime({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

export function runtimeQueryOptions() {
  return queryOptions({
    queryKey: runtimeKeys.all,
    queryFn: ({ signal }) =>
      requestRuntime({ signal }).catch((pollError: unknown) => {
        if (!signal.aborted) console.error("[runtime] poll failed", pollError);
        throw pollError;
      }),
    refetchInterval: RUNTIME_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
