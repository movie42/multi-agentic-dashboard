"use client";

import { useRef } from "react";
import { parseMessage } from "@/client/shared/lib/message";
import { Markdown } from "./Markdown";
import { SlackCopyButton } from "./SlackCopyButton";

interface MessageViewProps {
  message: string | null;
}

export function MessageView({ message }: MessageViewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const parsed = parseMessage(message);
  if (!parsed) return null;

  return (
    <div className="flex flex-col gap-2">
      <div ref={bodyRef} className="flex flex-col gap-2">
        {parsed.lead && <Markdown text={parsed.lead} />}
        {parsed.rest && (
          <details className="group">
            <summary className="cursor-pointer list-none text-[13px] text-muted hover:text-fg">
              <span className="group-open:hidden">전체 보기 ▾</span>
              <span className="hidden group-open:inline">접기 ▴</span>
            </summary>
            <div className="mt-2 max-h-[28rem] overflow-y-auto border-l-2 border-hair pl-3">
              <Markdown text={parsed.rest} />
            </div>
          </details>
        )}
      </div>
      <SlackCopyButton source={bodyRef} plainText={[parsed.lead, parsed.rest].filter(Boolean).join("\n\n")} />
      {parsed.isPreview && (
        <p className="text-[12px] text-faint">Orca가 앞 200자만 넘겨준 미리보기예요.</p>
      )}
    </div>
  );
}
