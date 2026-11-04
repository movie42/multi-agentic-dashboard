"use client";

import { createContext, useContext, useState } from "react";
import type { DiffLine } from "@/lib/intentDiff/types";

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
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const rows = foldRows(lines);
  const limit = showAll ? Infinity : LONG_ADDED;
  const visible = rows.slice(0, limit);
  const hidden = rows.length - visible.length;

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
            return shown.map((line, offset) => (
              <tr key={`${index}-${offset}`} data-new={line.kind === "del" ? undefined : (line.newNo ?? undefined)} className={ROW_STYLE[line.kind]}>
                <td className="w-10 px-2 text-right align-top text-faint select-none">{line.oldNo ?? ""}</td>
                <td className="w-10 px-2 text-right align-top text-faint select-none">{line.newNo ?? ""}</td>
                <td className="w-4 align-top text-muted select-none">{MARK[line.kind]}</td>
                {line.html !== undefined ? (
                  <td className="pr-3 whitespace-pre" dangerouslySetInnerHTML={{ __html: line.html }} />
                ) : (
                  <td className="pr-3 whitespace-pre">{line.text}</td>
                )}
              </tr>
            ));
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
