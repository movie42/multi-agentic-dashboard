"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseMessage } from "./message";

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
  const parsed = parseMessage(message);
  if (!parsed) return null;

  return (
    <div className="flex flex-col gap-2">
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
      {parsed.isPreview && (
        <p className="text-[12px] text-faint">Orca가 앞 200자만 넘겨준 미리보기예요.</p>
      )}
    </div>
  );
}
