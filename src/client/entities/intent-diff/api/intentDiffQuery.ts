import { queryOptions } from "@tanstack/react-query";
import type { IntentDiffResponse, IntentDiffResult, SymbolLookup, SymbolLookupResponse } from "@/common/intentDiff/types";

export interface IntentDiffQuery {
  worktreePath: string;
  base?: string | null;
  head?: string | null;
  task?: string | null;
}

export interface SymbolQuery {
  worktreePath: string;
  rev: string | null;
  file: string;
  line: number;
  col: number;
}

export const intentDiffKeys = {
  all: ["intent-diff"] as const,
  result: (href: string) => [...intentDiffKeys.all, "result", href] as const,
  symbol: (href: string) => [...intentDiffKeys.all, "symbol", href] as const,
};

export function intentDiffHref(query: IntentDiffQuery): string {
  const params = new URLSearchParams({ path: query.worktreePath });
  if (query.base) params.set("base", query.base);
  if (query.head) params.set("head", query.head);
  if (query.task) params.set("task", query.task);
  return `/diff?${params.toString()}`;
}

function symbolHref(query: SymbolQuery): string {
  const params = new URLSearchParams({ path: query.worktreePath, file: query.file, line: String(query.line), col: String(query.col) });
  if (query.rev) params.set("rev", query.rev);
  return `/api/intent-diff/symbol?${params.toString()}`;
}

async function fetchIntentDiff(href: string, signal: AbortSignal): Promise<IntentDiffResult> {
  const response = await fetch(href, { signal, cache: "no-store" });
  const body = (await response.json()) as IntentDiffResponse;
  if (!body.ok) throw new Error(body.error);
  return body.result;
}

async function fetchSymbol(href: string, signal: AbortSignal): Promise<SymbolLookup> {
  const response = await fetch(href, { signal, cache: "no-store" });
  const body = (await response.json()) as SymbolLookupResponse;
  if (!body.ok) throw new Error(body.error);
  return body.lookup;
}

export function intentDiffQueryOptions(query: IntentDiffQuery) {
  const href = intentDiffHref(query).replace(/^\/diff/, "/api/intent-diff");
  return queryOptions({
    queryKey: intentDiffKeys.result(href),
    queryFn: ({ signal }) => fetchIntentDiff(href, signal),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function symbolQueryOptions(query: SymbolQuery) {
  const href = symbolHref(query);
  return queryOptions({
    queryKey: intentDiffKeys.symbol(href),
    queryFn: ({ signal }) => fetchSymbol(href, signal),
    refetchOnWindowFocus: false,
    retry: false,
  });
}
