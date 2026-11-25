"use client";

import { createContext, useContext, useState } from "react";

interface A2uiPreview {
  /** Adds an option's preview to the slot; returns the removal. */
  register: (text: string) => () => void;
  peek: (text: string | null) => void;
  pin: (text: string | null) => void;
  unpin: (text: string) => void;
}

const noop = () => {};

const A2uiPreviewContext = createContext<A2uiPreview>({ register: () => noop, peek: noop, pin: noop, unpin: noop });

export function useA2uiPreview(): A2uiPreview {
  return useContext(A2uiPreviewContext);
}

interface A2uiPreviewAreaProps {
  children: React.ReactNode;
}

/**
 * One preview slot under the whole surface: the hovered option's preview, else the picked one's.
 * Every preview sits stacked in the same grid cell and only the shown one is visible, so the slot is always
 * as tall as the tallest preview. A slot that changed height would make the bottom-pinned chat scroll,
 * moving another option under the pointer and flickering between previews.
 */
export function A2uiPreviewArea({ children }: A2uiPreviewAreaProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [peeked, setPeeked] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const shown = peeked ?? pinned;
  const api: A2uiPreview = {
    register: (text) => {
      setPreviews((list) => [...list, text]);
      return () =>
        setPreviews((list) => {
          const index = list.indexOf(text);
          return index < 0 ? list : [...list.slice(0, index), ...list.slice(index + 1)];
        });
    },
    peek: setPeeked,
    pin: setPinned,
    unpin: (text) => setPinned((current) => (current === text ? null : current)),
  };
  const unique = [...new Set(previews)];
  return (
    <A2uiPreviewContext.Provider value={api}>
      <div className="flex flex-col gap-2.5">
        {children}
        {unique.length > 0 && (
          <div aria-label="미리보기" className="grid max-h-72 overflow-auto rounded-lg bg-tint-2 px-3 py-2 font-mono text-[12px] leading-relaxed">
            {unique.map((text) => (
              <pre key={text} aria-hidden={text !== shown} className={`col-start-1 row-start-1 whitespace-pre-wrap ${text === shown ? "" : "invisible"}`}>
                {text}
              </pre>
            ))}
            {shown === null && <p className="col-start-1 row-start-1 self-center font-sans text-muted">옵션에 마우스를 올리면 미리보기가 보여요</p>}
          </div>
        )}
      </div>
    </A2uiPreviewContext.Provider>
  );
}
