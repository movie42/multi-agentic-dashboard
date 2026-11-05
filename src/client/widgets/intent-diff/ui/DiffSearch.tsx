"use client";

import { useEffect, useRef, useState } from "react";
import type { AskThread, IntentDiffResult } from "@/common/intentDiff/types";
import { openAncestors } from "@/client/shared/lib/openAncestors";
import { buildSearchIndex, searchIndex, type SearchGroup, type SearchHit, type SearchTarget } from "../model/searchIndex";
import { stepAnchor } from "./FlowView";

const GROUP_LABEL: Record<SearchGroup, string> = {
  file: "파일",
  symbol: "함수",
  code: "코드",
  plan: "계획 항목",
  thread: "질문",
};

const REVEAL_FRAMES = 30;

function reveal(target: SearchTarget, nonce: number, frames = REVEAL_FRAMES) {
  const anchored = target.anchor ? document.getElementById(target.anchor) : null;
  const element = anchored ?? document.querySelector(`[data-search-hit="${nonce}"]`);
  if (element) {
    openAncestors(element);
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  if (frames > 0) requestAnimationFrame(() => reveal(target, nonce, frames - 1));
}

interface DiffSearchProps {
  result: IntentDiffResult;
  threads: AskThread[];
  /** Shows the plan reading mode, where plan items and flow steps live. */
  showPlan: () => void;
  onFocus: (focus: { line: NonNullable<SearchTarget["line"]>; nonce: number } | null) => void;
}

/** ⌘F on the diff page: finds files, functions, code, plan items and questions, including folded lines. */
export function DiffSearch({ result, threads, showPlan, onFocus }: DiffSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nonce = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.code === "KeyF") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) return null;

  const hits = searchIndex(buildSearchIndex(result, threads, stepAnchor), query);
  const active = Math.min(cursor, Math.max(0, hits.length - 1));

  const choose = (hit: SearchHit | undefined) => {
    if (!hit) return;
    setOpen(false);
    if (hit.target.needsPlan) showPlan();
    nonce.current += 1;
    onFocus(hit.target.line ? { line: hit.target.line, nonce: nonce.current } : null);
    const id = nonce.current;
    requestAnimationFrame(() => reveal(hit.target, id));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((active + 1) % Math.max(1, hits.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((active - 1 + hits.length) % Math.max(1, hits.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(hits[active]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-fg/20 px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="검색"
        className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-[14px] bg-bg font-sans shadow-[0_24px_64px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]"
        onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="파일 · 함수 · 코드 · 질문 찾기"
          className="border-b border-hair bg-transparent px-5 py-4 text-[16px] outline-none placeholder:text-muted"
        />
        <ul className="overflow-y-auto py-1.5">
          {query.trim() && hits.length === 0 && <li className="px-5 py-4 text-[14px] text-muted">찾은 게 없어요.</li>}
          {hits.map((hit, index) => (
            <li key={hit.key}>
              {(index === 0 || hits[index - 1]?.group !== hit.group) && (
                <p className="px-5 pt-2 pb-1 text-[11px] font-semibold text-muted">{GROUP_LABEL[hit.group]}</p>
              )}
              <button
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(hit)}
                className={`flex w-full items-baseline gap-3 px-5 py-1.5 text-left ${index === active ? "bg-tint" : ""}`}
              >
                <span className={`min-w-0 flex-1 truncate text-[14px] ${hit.group === "code" ? "font-mono text-[12px]" : ""}`}>{hit.title}</span>
                {hit.detail && <span className="shrink-0 font-mono text-[11px] text-muted">{hit.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
