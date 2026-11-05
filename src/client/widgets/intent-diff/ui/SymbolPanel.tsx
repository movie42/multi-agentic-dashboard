"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { SymbolLocation } from "@/common/intentDiff/types";
import { symbolQueryOptions } from "@/client/entities/intent-diff";
import { errorMessage } from "@/client/shared/model/errorMessage";
import type { SymbolTarget } from "./CodeLines";

// `!` because a diff row already carries its own add/remove background class.
const FOCUS = ["!bg-ask/25", "shadow-[inset_3px_0_0_var(--color-ask)]"];
const FOCUS_MARK = "data-symbol-focus";

function focusRow(element: HTMLElement | null) {
  document.querySelectorAll<HTMLElement>(`[${FOCUS_MARK}]`).forEach((row) => {
    row.classList.remove(...FOCUS);
    row.removeAttribute(FOCUS_MARK);
  });
  element?.classList.add(...FOCUS);
  element?.setAttribute(FOCUS_MARK, "");
}
// Token colors arrive as `--shiki-light` / `--shiki-dark` on each span, as in the diff table.
const CODE_COLORS = "[&_span]:text-(color:--shiki-light) dark:[&_span]:text-(color:--shiki-dark)";

function useSymbolLookup(worktreePath: string, rev: string | null, target: SymbolTarget) {
  const lookupQuery = useQuery(symbolQueryOptions({ worktreePath, rev, file: target.file, line: target.line, col: target.col }));
  return { lookup: lookupQuery.data ?? null, error: lookupQuery.error ? errorMessage(lookupQuery.error) : null };
}

/** The rendered line of this page that shows `file:line`, when it is on screen and not folded. */
function lineOnPage(location: SymbolLocation): HTMLElement | null {
  if (location.external) return null;
  const selector = `[data-file="${CSS.escape(location.file)}"] tr[data-new="${location.line}"]`;
  // A row inside a closed <details> or another tab is in the DOM but has no box to scroll to.
  return [...document.querySelectorAll<HTMLElement>(selector)].find((row) => row.getClientRects().length > 0) ?? null;
}

interface LocationRowProps {
  location: SymbolLocation;
}

function LocationRow({ location }: LocationRowProps) {
  const [open, setOpen] = useState(false);
  const snippetRef = useRef<HTMLPreElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = snippetRef.current;
    const target = targetRef.current;
    if (!open || !box || !target) return;
    box.scrollTop = target.offsetTop - box.clientHeight / 3;
  }, [open]);

  const show = () => {
    const element = lineOnPage(location);
    if (!element) {
      setOpen(!open);
      return;
    }
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    focusRow(element);
  };

  return (
    <li>
      <button type="button" onClick={show} className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-tint">
        <span className="font-mono text-[11px] text-muted">
          {location.file}:{location.line}
        </span>
        {location.html ? (
          <span className={`overflow-hidden font-mono text-[12px] text-ellipsis whitespace-pre ${CODE_COLORS}`} dangerouslySetInnerHTML={{ __html: location.html }} />
        ) : (
          <span className="truncate font-mono text-[12px]">{location.text}</span>
        )}
      </button>
      {open && (
        <pre ref={snippetRef} className="relative mx-2 mb-2 max-h-[60vh] overflow-auto rounded-md bg-tint px-2 py-1.5 font-mono text-[11px] leading-[1.6]">
          {location.snippet.lines.map((text, index) => {
            const lineNo = location.snippet.startLine + index;
            const html = location.snippet.html?.[index];
            return (
              <div
                key={lineNo}
                ref={lineNo === location.line ? targetRef : undefined}
                className={`flex ${lineNo === location.line ? "bg-ask/15 font-semibold text-fg" : "text-muted"}`}
              >
                <span className="mr-3 inline-block w-8 shrink-0 text-right text-faint select-none">{lineNo}</span>
                {html !== undefined ? <span className={CODE_COLORS} dangerouslySetInnerHTML={{ __html: html }} /> : text}
              </div>
            );
          })}
        </pre>
      )}
    </li>
  );
}

interface SymbolPanelProps {
  worktreePath: string;
  /** The commit the page shows, when it is not the working tree. */
  rev: string | null;
  target: SymbolTarget;
  onClose: () => void;
}

export function SymbolPanel({ worktreePath, rev, target, onClose }: SymbolPanelProps) {
  const { lookup, error } = useSymbolLookup(worktreePath, rev, target);

  useEffect(() => () => focusRow(null), []);

  return (
    <aside className="fixed inset-y-0 right-0 z-20 flex w-full max-w-[28rem] flex-col border-l border-hair bg-bg shadow-[-8px_0_24px_-12px_var(--faint)]">
      <header className="flex items-baseline gap-2 border-b border-hair px-4 py-3">
        <span className="font-mono text-[15px] font-semibold">{lookup?.name ?? target.name}</span>
        <span className="truncate font-mono text-[11px] text-muted">
          {target.file}:{target.line}
        </span>
        <button type="button" onClick={onClose} className="ml-auto shrink-0 rounded-full px-2 text-[13px] whitespace-nowrap text-muted hover:bg-tint hover:text-fg">
          닫기
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-2 py-3 text-[13px]">
        {error && <p className="px-2 text-accent">{error}</p>}
        {!lookup && !error && <p className="px-2 text-muted">저장소 전체에서 찾는 중이에요… 처음 한 번은 몇 초 걸려요.</p>}
        {lookup && (
          <div className="flex flex-col gap-5">
            {lookup.signatureHtml ? (
              <pre
                className={`mx-2 overflow-x-auto rounded-md bg-tint px-3 py-2 font-mono text-[12px] leading-[1.6] whitespace-pre-wrap ${CODE_COLORS}`}
                dangerouslySetInnerHTML={{ __html: lookup.signatureHtml }}
              />
            ) : (
              lookup.signature && (
                <pre className="mx-2 overflow-x-auto rounded-md bg-tint px-3 py-2 font-mono text-[12px] leading-[1.6] whitespace-pre-wrap">{lookup.signature}</pre>
              )
            )}
            <section>
              <h3 className="px-2 pb-1 text-[12px] font-bold text-muted">정의 {lookup.definitions.length}</h3>
              <ul>
                {lookup.definitions.map((location) => (
                  <LocationRow key={`${location.file}:${location.line}`} location={location} />
                ))}
              </ul>
            </section>
            <section>
              <h3 className="px-2 pb-1 text-[12px] font-bold text-muted">
                쓰는 곳 {lookup.references.length}
                {lookup.truncated ? "+ (일부만)" : ""}
              </h3>
              {lookup.references.length === 0 ? (
                <p className="px-2 text-muted">정의 말고는 쓰는 곳이 없어요.</p>
              ) : (
                <ul>
                  {lookup.references.map((location) => (
                    <LocationRow key={`${location.file}:${location.line}:${location.text}`} location={location} />
                  ))}
                </ul>
              )}
            </section>
            <p className="px-2 text-[11px] text-faint">줄을 누르면 이 화면에 있는 코드면 그 자리로 가고, 없으면 그 줄이 든 함수·타입 전체를 펼쳐요.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
