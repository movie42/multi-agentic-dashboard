"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseMessage } from "@/client/shared/lib/message";
import { copyForSlack } from "@/client/shared/lib/slackClipboard";

interface MarkdownProps {
  text: string;
}

function Markdown({ text }: MarkdownProps) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

interface MessageViewProps {
  message: string | null;
}

export function MessageView({ message }: MessageViewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const parsed = parseMessage(message);
  if (!parsed) return null;

  const copy = async () => {
    if (!bodyRef.current) return;
    try {
      await copyForSlack(
        bodyRef.current,
        [parsed.lead, parsed.rest].filter(Boolean).join("\n\n"),
      );
      setCopied(true);
    } catch (error) {
      console.error("[message] clipboard", error);
    }
  };

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
      <button
        type="button"
        onClick={copy}
        onBlur={() => setCopied(false)}
        className="self-start text-[12px] text-muted underline decoration-faint underline-offset-[3px] hover:text-fg"
      >
        {copied ? "복사했어요 · 슬랙에 붙여넣기" : "슬랙용으로 복사"}
      </button>
      {parsed.isPreview && (
        <p className="text-[12px] text-faint">Orca가 앞 200자만 넘겨준 미리보기예요.</p>
      )}
    </div>
  );
}
