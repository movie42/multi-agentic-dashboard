"use client";

import { useQuery } from "@tanstack/react-query";
import { chatQueryOptions } from "@/client/entities/session";
import { Markdown } from "@/client/shared/ui/Markdown";
import { latestPrDraft } from "../model/prDraft";

interface PrDraftPreviewProps {
  sessionId: string;
}

export function PrDraftPreview({ sessionId }: PrDraftPreviewProps) {
  const chat = useQuery(chatQueryOptions(sessionId));
  const draft = chat.data ? latestPrDraft(chat.data) : null;
  if (!draft) return null;
  return (
    <section aria-label="PR 본문 미리보기" className="flex flex-col gap-1.5">
      <p className="flex items-baseline gap-2 text-[12px]">
        <span className="font-semibold">PR 본문 미리보기</span>
        <span className="min-w-0 truncate font-mono text-muted">{draft.path.split("/").pop()}</span>
      </p>
      <div className="max-h-[28rem] overflow-auto rounded-lg bg-tint-2 px-3 py-2">
        <Markdown text={draft.content} />
      </div>
    </section>
  );
}
