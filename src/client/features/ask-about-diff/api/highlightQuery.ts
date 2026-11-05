import { queryOptions } from "@tanstack/react-query";
import type { HighlightResponse } from "@/common/intentDiff/types";
import { readJson } from "@/client/shared/api/json";

async function fetchHighlight(code: string, lang: string, signal: AbortSignal): Promise<string[]> {
  const response = await fetch("/api/intent-diff/highlight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, lang }),
    signal,
  });
  const body = await readJson<HighlightResponse>(response);
  if (!body.ok) throw new Error(body.error);
  return body.html;
}

export function highlightQueryOptions(code: string, lang: string, enabled: boolean) {
  return queryOptions({
    queryKey: ["answer-highlight", lang, code] as const,
    queryFn: ({ signal }) =>
      fetchHighlight(code, lang, signal).catch((error: unknown) => {
        if (!signal.aborted) console.warn("[answer] highlight failed", error);
        throw error;
      }),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
