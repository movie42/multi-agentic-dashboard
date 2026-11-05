"use client";

import { createContext, useEffect, useState } from "react";
import type { ConclusionRequest, ConclusionResponse } from "@/common/intentDiff/conclusion";
import type { AskEvent, AskRequest, AskThread, AskThreadsResponse, IntentDiffResult } from "@/common/intentDiff/types";
import { readJson, parseJsonLine, errorField } from "@/client/shared/api/json";

export interface LiveAnswer {
  text: string;
  tools: string[];
}

export type AskInput = Omit<AskRequest, "worktreePath">;

export interface AskBoard {
  threads: AskThread[];
  live: Record<string, LiveAnswer>;
  /** Sends a question; resolves once the answer is saved. Throws when no thread could be started. */
  ask: (input: AskInput, onThread?: (thread: AskThread) => void) => Promise<void>;
  /** Drafts, judges, confirms or marks conclusions as sent; throws on failure. */
  conclude: (request: ConclusionRequest) => Promise<void>;
  reload: () => void;
  /** The session that last changed lines `start..end` of `file`, by the intent groups over them. */
  writerOf: (file: string, start: number, end: number) => string | null;
}

export const AskBoardContext = createContext<AskBoard | null>(null);

interface Span {
  file: string;
  start: number;
  end: number;
  sessionId: string;
  startedAt: number;
}

function writerSpans(result: IntentDiffResult): Span[] {
  const groups = [
    ...(result.plan?.phases.flatMap((phase) => phase.items.flatMap((item) => item.groups)) ?? []),
    ...result.groups,
    ...result.unplanned,
  ];
  const hunks = new Map(result.files.flatMap((file) => file.hunks.map((hunk) => [hunk.id, hunk] as const)));
  return groups.flatMap((group) =>
    group.hunks.flatMap((ref): Span[] => {
      const hunk = hunks.get(ref.hunkId);
      const numbers = hunk?.lines.flatMap((line) => (line.kind === "add" && line.newNo !== null ? [line.newNo] : [])) ?? [];
      // A hunk that only removes lines sits between its neighbours' new-side numbers.
      const start = numbers.length > 0 ? Math.min(...numbers) : (hunk?.newStart ?? 0);
      const end = numbers.length > 0 ? Math.max(...numbers) : start;
      return hunk && group.sessionId ? [{ file: hunk.file, start, end, sessionId: group.sessionId, startedAt: group.startedAt }] : [];
    }),
  );
}

function upsert(threads: AskThread[], thread: AskThread): AskThread[] {
  const index = threads.findIndex((item) => item.id === thread.id);
  return index >= 0 ? threads.map((item, at) => (at === index ? thread : item)) : [...threads, thread];
}

export function useAskBoard(worktreePath: string, result: IntentDiffResult): AskBoard {
  const [threads, setThreads] = useState<AskThread[]>([]);
  const [live, setLive] = useState<Record<string, LiveAnswer>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const spans = writerSpans(result);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/intent-diff/ask?${new URLSearchParams({ path: worktreePath }).toString()}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => readJson<AskThreadsResponse>(response))
      .then((body) => {
        if (body.ok) setThreads(body.threads);
        else console.warn("[ask] threads unreadable", body.error);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.warn("[ask] threads unreadable", error);
      });
    return () => controller.abort();
  }, [worktreePath, reloadKey]);

  const patchLive = (id: string, update: (answer: LiveAnswer) => LiveAnswer | null) =>
    setLive((previous) => {
      const next = { ...previous };
      const value = update(previous[id] ?? { text: "", tools: [] });
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });

  const ask: AskBoard["ask"] = async (input, onThread) => {
    const response = await fetch("/api/intent-diff/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, worktreePath } satisfies AskRequest),
    });
    if (!response.ok || !response.body) {
      const body: unknown = await response.json().catch(() => null);
      throw new Error(errorField(body) ?? `질문을 보내지 못했어요 (${response.status})`);
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    // eslint-disable-next-line no-restricted-syntax -- NDJSON stream buffer and the thread id announced in it
    let buffer = "";
    // eslint-disable-next-line no-restricted-syntax -- NDJSON stream buffer and the thread id announced in it
    let threadId: string | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = parseJsonLine<AskEvent>(line);
        if (event.type === "thread") {
          threadId = event.thread.id;
          setThreads((previous) => upsert(previous, event.thread));
          patchLive(event.thread.id, () => ({ text: "", tools: [] }));
          onThread?.(event.thread);
        } else if (event.type === "text" && threadId) {
          const id = threadId;
          patchLive(id, (answer) => ({ ...answer, text: answer.text + event.text }));
        } else if (event.type === "tool" && threadId) {
          const id = threadId;
          patchLive(id, (answer) => ({ ...answer, tools: [...answer.tools, event.label] }));
        } else if (event.type === "done" || event.type === "error") {
          if (event.thread) {
            const saved = event.thread;
            setThreads((previous) => upsert(previous, saved));
            patchLive(saved.id, () => null);
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
    }
  };

  const conclude: AskBoard["conclude"] = async (request) => {
    const response = await fetch("/api/intent-diff/ask/conclusion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = await readJson<ConclusionResponse>(response);
    if (!body.ok) throw new Error(body.error);
    setThreads((previous) => body.threads.reduce(upsert, previous));
  };

  const writerOf: AskBoard["writerOf"] = (file, start, end) => {
    const hits = spans.filter((span) => span.file === file && span.start <= end && span.end >= start);
    if (hits.length === 0) return null;
    return hits.reduce((latest, span) => (span.startedAt > latest.startedAt ? span : latest)).sessionId;
  };

  return { threads, live, ask, conclude, reload: () => setReloadKey((key) => key + 1), writerOf };
}
