"use client";

import { createContext, Fragment, useContext, useEffect, useRef, useState } from "react";
import type { AskAnchor, AskContext, DiffLine } from "@/common/intentDiff/types";
import { AskDraft, AskPlanItem, AskStepContext, ThreadView } from "@/client/features/ask-about-diff";
import { AskBoardContext } from "@/client/features/ask-about-diff";

const CONTEXT_AROUND = 2;
const FOLD_MIN = 6;
const LONG_ADDED = 120;

export interface SymbolTarget {
  file: string;
  line: number;
  col: number;
  name: string;
}

/** Called when an identifier in the code is clicked; the page opens the symbol panel. */
export const SymbolClick = createContext<((target: SymbolTarget) => void) | null>(null);

const ROW_STYLE = { add: "bg-done/10", del: "bg-accent/10", ctx: "" } as const;
const MARK = { add: "+", del: "−", ctx: " " } as const;

type Row = { type: "line"; line: DiffLine } | { type: "fold"; lines: DiffLine[] };

/** Rows picked by line number: `from..to` index into the lines, `start` is where shift-click extends from. */
interface Pick {
  start: number;
  from: number;
  to: number;
}

/** End-side line numbers of the picked rows; a run of removed lines borrows its neighbour's number. */
function pickedRange(lines: DiffLine[], pick: Pick): { startLine: number; endLine: number } {
  const numbers = lines.slice(pick.from, pick.to + 1).flatMap((line) => (line.newNo !== null ? [line.newNo] : []));
  if (numbers.length > 0) return { startLine: Math.min(...numbers), endLine: Math.max(...numbers) };
  const after = lines.slice(pick.to + 1).find((line) => line.newNo !== null)?.newNo;
  const before = lines.slice(0, pick.from).findLast((line) => line.newNo !== null)?.newNo;
  const line = after ?? before ?? 1;
  return { startLine: line, endLine: line };
}

/** The lines as a unified diff body, for a question about them. */
export function diffText(lines: DiffLine[]): string {
  return lines.map((line) => `${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}${line.text}`).join("\n");
}

/** Unchanged runs longer than FOLD_MIN, away from any change, collapse into one row. */
function foldRows(lines: DiffLine[]): Row[] {
  const near = lines.map((_, index) =>
    lines.slice(Math.max(0, index - CONTEXT_AROUND), index + CONTEXT_AROUND + 1).some((line) => line.kind !== "ctx"),
  );
  const rows: Row[] = [];
  let run: DiffLine[] = [];
  const flush = () => {
    if (run.length >= FOLD_MIN) rows.push({ type: "fold", lines: run });
    else rows.push(...run.map((line): Row => ({ type: "line", line })));
    run = [];
  };
  lines.forEach((line, index) => {
    if (line.kind === "ctx" && !near[index]) run.push(line);
    else {
      flush();
      rows.push({ type: "line", line });
    }
  });
  flush();
  return rows;
}

interface CodeLinesProps {
  file: string;
  lines: DiffLine[];
}

export function CodeLines({ file, lines }: CodeLinesProps) {
  const onSymbol = useContext(SymbolClick);
  const board = useContext(AskBoardContext);
  const step = useContext(AskStepContext);
  const planItem = useContext(AskPlanItem);
  const [pick, setPick] = useState<Pick | null>(null);
  // The press that started on a line number: a release without moving is a click, otherwise a drag.
  const press = useRef<{ index: number; wasOnlyPick: boolean; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const release = () => {
      const current = press.current;
      if (!current) return;
      press.current = null;
      setDragging(false);
      // Clicking the one picked line again clears the pick.
      if (!current.moved && current.wasOnlyPick) setPick(null);
    };
    window.addEventListener("mouseup", release);
    return () => window.removeEventListener("mouseup", release);
  }, []);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const rows = foldRows(lines);
  const limit = showAll ? Infinity : LONG_ADDED;
  const visible = rows.slice(0, limit);
  const hidden = rows.length - visible.length;

  const indexOf = new Map(lines.map((line, index) => [line, index]));
  const threadsAt = (line: DiffLine) =>
    line.newNo === null
      ? []
      : (board?.threads ?? []).filter(
          (thread) => thread.anchor.kind === "lines" && thread.anchor.file === file && thread.anchor.endLine === line.newNo,
        );

  const extendTo = (index: number) =>
    setPick((current) => current && { start: current.start, from: Math.min(current.start, index), to: Math.max(current.start, index) });

  const draft = (): { anchor: AskAnchor; context: AskContext } | null => {
    if (!pick) return null;
    const picked = lines.slice(pick.from, pick.to + 1);
    return {
      anchor: { kind: "lines", file, ...pickedRange(lines, pick) },
      context: {
        label: step?.label ?? file.split("/").pop() ?? file,
        planItem,
        intents: step?.intents ?? [],
        diff: diffText(picked),
      },
    };
  };
  const pending = draft();

  const handleClick = (event: React.MouseEvent<HTMLTableSectionElement>) => {
    if (!onSymbol || !(event.target instanceof Element)) return;
    const token = event.target.closest(".sym");
    const row = token?.closest("tr");
    const line = Number(row?.getAttribute("data-new"));
    const col = Number(token?.getAttribute("data-col"));
    if (!token || !line || Number.isNaN(col)) return;
    onSymbol({ file, line, col, name: token.textContent ?? "" });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[12px] leading-[1.6] [&_span]:text-(color:--shiki-light) dark:[&_span]:text-(color:--shiki-dark) [&_.sym]:cursor-pointer [&_.sym:hover]:underline">
        <tbody onClick={handleClick}>
          {visible.map((row, index) => {
            if (row.type === "fold" && !opened.has(index)) {
              return (
                <tr key={index}>
                  <td colSpan={3} />
                  <td className="py-0.5">
                    <button
                      type="button"
                      onClick={() => setOpened(new Set(opened).add(index))}
                      className="rounded px-1.5 text-[11px] text-muted hover:bg-tint"
                    >
                      ⋯ 바뀌지 않은 {row.lines.length}줄
                    </button>
                  </td>
                </tr>
              );
            }
            const shown = row.type === "fold" ? row.lines : [row.line];
            return shown.map((line, offset) => {
              const at = indexOf.get(line) ?? -1;
              const picked = pick !== null && at >= pick.from && at <= pick.to;
              const numberCell = `w-10 px-2 text-right align-top select-none ${board ? "cursor-pointer hover:text-now" : ""} ${picked ? "text-now" : "text-faint"}`;
              // Press on a line number and drag over others to pick a range, as on GitHub.
              const numberEvents = board
                ? {
                    onMouseDown: (event: React.MouseEvent) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      if (event.shiftKey && pick) return extendTo(at);
                      press.current = { index: at, wasOnlyPick: pick?.from === at && pick.to === at, moved: false };
                      setDragging(true);
                      setPick({ start: at, from: at, to: at });
                    },
                    onMouseEnter: () => {
                      if (!press.current) return;
                      if (at !== press.current.index) press.current.moved = true;
                      extendTo(at);
                    },
                  }
                : {};
              const threads = threadsAt(line);
              return (
                <Fragment key={`${index}-${offset}`}>
                  <tr data-new={line.kind === "del" ? undefined : (line.newNo ?? undefined)} className={picked ? "bg-now/10" : ROW_STYLE[line.kind]}>
                    <td className={numberCell} {...numberEvents} title={board ? "눌러서 이 줄 묻기 · 끌거나 Shift로 범위" : undefined}>
                      {line.oldNo ?? ""}
                    </td>
                    <td className={numberCell} {...numberEvents} title={board ? "눌러서 이 줄 묻기 · 끌거나 Shift로 범위" : undefined}>
                      {line.newNo ?? ""}
                    </td>
                    <td className="w-4 align-top text-muted select-none">{MARK[line.kind]}</td>
                    {line.html !== undefined ? (
                      <td className="pr-3 whitespace-pre" dangerouslySetInnerHTML={{ __html: line.html }} />
                    ) : (
                      <td className="pr-3 whitespace-pre">{line.text}</td>
                    )}
                  </tr>
                  {threads.map((thread) => (
                    <tr key={thread.id}>
                      <td colSpan={4} className="px-3">
                        <ThreadView thread={thread} />
                      </td>
                    </tr>
                  ))}
                  {pending && !dragging && pick?.to === at && (
                    <tr>
                      <td colSpan={4} className="px-3">
                        <AskDraft anchor={pending.anchor} context={pending.context} onClose={() => setPick(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            });
          })}
        </tbody>
      </table>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full border-t border-hair px-3 py-1.5 text-left text-[12px] text-muted hover:bg-tint"
        >
          {hidden}줄 더 보기
        </button>
      )}
    </div>
  );
}
