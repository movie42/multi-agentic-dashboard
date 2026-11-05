"use client";

import { startTransition, useActionState, useState } from "react";
import { isSent } from "@/common/intentDiff/conclusion";
import type { ConclusionRequest } from "@/common/intentDiff/conclusion";
import type { AskThread } from "@/common/intentDiff/types";
import { formatClock } from "@/client/shared/lib/format";
import { toastError } from "@/client/shared/model/toastStore";

interface ConclusionBoxProps {
  thread: AskThread;
  /** No answer has come back yet, so there is nothing to conclude. */
  waiting: boolean;
  conclude: (request: ConclusionRequest) => Promise<void>;
}

const BUTTON = "rounded-md px-3 py-1 font-semibold disabled:opacity-40";

export function ConclusionBox({ thread, waiting, conclude }: ConclusionBoxProps) {
  const conclusion = thread.conclusion ?? null;
  const [editing, setEditing] = useState<string | null>(null);
  const [failure, dispatch, pending] = useActionState(async (_previous: string | null, request: ConclusionRequest): Promise<string | null> => {
    try {
      await conclude(request);
      if (request.type === "confirm" || request.type === "draft") setEditing(null);
      return null;
    } catch (error) {
      toastError("ask conclusion", error);
      return error instanceof Error ? error.message : String(error);
    }
  }, null);
  const send = (request: ConclusionRequest) => {
    if (pending) return;
    startTransition(() => dispatch(request));
  };
  const draftButton = (
    <button
      type="button"
      onClick={() => send({ type: "draft", threadId: thread.id })}
      disabled={waiting || pending}
      aria-busy={pending}
      className={`${BUTTON} border border-hair text-fg hover:bg-tint`}
    >
      결론 정리
    </button>
  );

  if (!conclusion) {
    return (
      <div className="flex flex-col gap-1.5 font-sans text-[12px]">
        <div>{draftButton}</div>
        {failure && !pending && <p className="text-accent">{failure}</p>}
      </div>
    );
  }

  const confirmed = conclusion.confirmedAt !== null;
  const text = editing ?? conclusion.text;
  const isEditing = editing !== null || !confirmed;
  const judgment = (
    <button
      type="button"
      onClick={() => send({ type: "judge", threadId: thread.id, needsChange: !conclusion.needsChange })}
      disabled={pending}
      aria-pressed={conclusion.needsChange}
      className={`shrink-0 rounded-full px-2 py-1 text-[11px] leading-none font-semibold ${conclusion.needsChange ? "bg-now text-bg" : "bg-tint text-muted"}`}
    >
      {conclusion.needsChange ? "수정 필요" : "수정 안 함"}
    </button>
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-hair bg-tint/40 px-2.5 py-2 font-sans text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        {judgment}
        {isSent(conclusion) && conclusion.sentAt !== null && <span className="text-muted">수정 보냄 · {formatClock(conclusion.sentAt)}</span>}
      </div>
      {isEditing ? (
        <textarea
          value={text}
          onChange={(event) => setEditing(event.target.value)}
          rows={3}
          aria-label="결론"
          className="w-full resize-y rounded-md border border-hair bg-bg px-2.5 py-2 text-[13px] leading-[1.5] outline-none focus:border-focus"
        />
      ) : (
        <button type="button" onClick={() => setEditing(conclusion.text)} className="text-left text-[13px] leading-[1.5] whitespace-pre-wrap text-fg">
          {conclusion.text}
        </button>
      )}
      {failure && !pending && <p className="text-accent">{failure}</p>}
      {isEditing && (
        <div className="flex flex-wrap items-center gap-3">
          {draftButton}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => send({ type: "confirm", threadId: thread.id, text: text.trim() })}
            disabled={!text.trim() || pending}
            className={`${BUTTON} bg-fg text-bg`}
          >
            확정
          </button>
        </div>
      )}
    </div>
  );
}
