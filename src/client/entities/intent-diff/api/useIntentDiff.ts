"use client";

import { useEffect, useState } from "react";
import type { IntentDiffResponse, IntentDiffResult } from "@/common/intentDiff/types";

export interface IntentDiffQuery {
  worktreePath: string;
  base?: string | null;
  head?: string | null;
  task?: string | null;
}

type IntentDiffState =
  | { status: "loading"; result: IntentDiffResult | null }
  | { status: "ready"; result: IntentDiffResult }
  | { status: "error"; error: string; result: IntentDiffResult | null };

interface Settled {
  key: string;
  result: IntentDiffResult | null;
  error: string | null;
}

export function intentDiffHref(query: IntentDiffQuery): string {
  const params = new URLSearchParams({ path: query.worktreePath });
  if (query.base) params.set("base", query.base);
  if (query.head) params.set("head", query.head);
  if (query.task) params.set("task", query.task);
  return `/diff?${params.toString()}`;
}

export function useIntentDiff(query: IntentDiffQuery): { state: IntentDiffState; reload: () => void } {
  const [settled, setSettled] = useState<Settled>({ key: "", result: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const href = intentDiffHref(query).replace(/^\/diff/, "/api/intent-diff");
  const requestKey = `${href}#${reloadKey}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(href, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json() as Promise<IntentDiffResponse>)
      .then((body) =>
        setSettled((previous) =>
          body.ok
            ? { key: requestKey, result: body.result, error: null }
            : { key: requestKey, result: previous.result, error: body.error },
        ),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        setSettled((previous) => ({ key: requestKey, result: previous.result, error: message }));
      });
    return () => controller.abort();
  }, [href, requestKey]);

  const state: IntentDiffState =
    settled.key !== requestKey
      ? { status: "loading", result: settled.result }
      : settled.error !== null || settled.result === null
        ? { status: "error", error: settled.error ?? "결과가 비어 있어요", result: settled.result }
        : { status: "ready", result: settled.result };

  return { state, reload: () => setReloadKey((key) => key + 1) };
}
