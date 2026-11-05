"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { IntentDiffResult } from "@/common/intentDiff/types";
import { errorMessage } from "@/client/shared/model/errorMessage";
import { intentDiffQueryOptions, type IntentDiffQuery } from "./intentDiffQuery";

export type IntentDiffState =
  | { status: "loading"; result: IntentDiffResult | null }
  | { status: "ready"; result: IntentDiffResult }
  | { status: "error"; error: string; result: IntentDiffResult | null };

export function useIntentDiff(query: IntentDiffQuery): { state: IntentDiffState; reload: () => void } {
  const diffQuery = useQuery({ ...intentDiffQueryOptions(query), placeholderData: keepPreviousData });
  const result = diffQuery.data ?? null;

  const state: IntentDiffState = diffQuery.isFetching
    ? { status: "loading", result }
    : diffQuery.error !== null || result === null
      ? { status: "error", error: diffQuery.error ? errorMessage(diffQuery.error) : "결과가 비어 있어요", result }
      : { status: "ready", result };

  return { state, reload: () => void diffQuery.refetch() };
}
