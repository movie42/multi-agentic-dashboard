"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TODO_MEMO_LIMIT } from "@/common/todos/schema";

interface MemoEditorProps {
  memo: string;
  onSave: (memo: string) => void;
}

type MemoTab = "write" | "preview";

interface MemoMarkdownProps {
  text: string;
}

function MemoMarkdown({ text }: MemoMarkdownProps) {
  return (
    <div className="md !text-[14px] !leading-[1.7]">
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

export function MemoEditor({ memo, onSave }: MemoEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [tab, setTab] = useState<MemoTab>("write");

  if (draft === null) {
    return (
      <button
        type="button"
        aria-label="메모 편집"
        onClick={() => {
          setDraft(memo);
          setTab("write");
        }}
        className="min-h-16 rounded-[10px] bg-tint px-4 py-3 text-left hover:bg-tint-2"
      >
        {memo.trim() ? <MemoMarkdown text={memo} /> : <span className="text-[14px] text-muted">메모 없음 · 눌러서 쓰기 (마크다운)</span>}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex rounded-full bg-tint p-0.5 text-[12px] font-semibold self-start">
        {(["write", "preview"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full px-3 py-1 leading-none ${tab === key ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
          >
            {key === "write" ? "쓰기" : "미리보기"}
          </button>
        ))}
      </div>
      {tab === "write" ? (
        <textarea
          autoFocus
          aria-label="메모"
          value={draft}
          maxLength={TODO_MEMO_LIMIT}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
          rows={10}
          className="rounded-[10px] bg-tint px-4 py-3 font-mono text-[13px] leading-[1.6] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
        />
      ) : (
        <div className="min-h-16 rounded-[10px] bg-tint px-4 py-3">
          {draft.trim() ? <MemoMarkdown text={draft} /> : <span className="text-[14px] text-muted">미리 볼 내용이 없어요</span>}
        </div>
      )}
      <div className="flex justify-end gap-3 text-[13px]">
        <button type="button" onClick={() => setDraft(null)} className="text-muted hover:text-fg">
          취소
        </button>
        <button
          type="button"
          onClick={() => {
            onSave(draft);
            setDraft(null);
          }}
          className="rounded-md bg-fg px-3 py-1 font-semibold text-bg"
        >
          메모 저장
        </button>
      </div>
    </div>
  );
}
