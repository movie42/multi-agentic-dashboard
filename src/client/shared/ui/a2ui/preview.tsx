"use client";

import { createContext, useContext, useState } from "react";

interface A2uiPreview {
  peek: (text: string | null) => void;
  pin: (text: string | null) => void;
  unpin: (text: string) => void;
}

const noop = () => {};

const A2uiPreviewContext = createContext<A2uiPreview>({ peek: noop, pin: noop, unpin: noop });

export function useA2uiPreview(): A2uiPreview {
  return useContext(A2uiPreviewContext);
}

interface A2uiPreviewAreaProps {
  children: React.ReactNode;
}

/** One preview slot under the whole surface: the hovered option's preview, else the picked one's. Options never move. */
export function A2uiPreviewArea({ children }: A2uiPreviewAreaProps) {
  const [peeked, setPeeked] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const shown = peeked ?? pinned;
  const api: A2uiPreview = {
    peek: setPeeked,
    pin: setPinned,
    unpin: (text) => setPinned((current) => (current === text ? null : current)),
  };
  return (
    <A2uiPreviewContext.Provider value={api}>
      <div className="flex flex-col gap-2.5">
        {children}
        {shown && (
          <pre
            aria-label="미리보기"
            className="max-h-72 overflow-auto rounded-lg bg-tint-2 px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap"
          >
            {shown}
          </pre>
        )}
      </div>
    </A2uiPreviewContext.Provider>
  );
}
