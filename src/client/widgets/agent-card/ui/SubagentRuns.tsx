"use client";

import { useState } from "react";
import type { SubagentRun } from "@/common/board/types";

interface SubagentRunsProps {
  runs: SubagentRun[];
}

/** '서브 에이전트 n개 실행 중', opening to what each one is doing right now. */
export function SubagentRuns({ runs }: SubagentRunsProps) {
  const [open, setOpen] = useState(false);
  if (runs.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 text-[12px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 leading-none font-semibold text-now shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint"
      >
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
        서브 에이전트 {runs.length}개 실행 중
        <span className="text-muted">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-1 rounded-[10px] bg-tint p-2">
          {runs.map((run) => (
            <li key={run.id} className="flex min-w-0 flex-col gap-0.5 rounded-[8px] bg-bg px-2.5 py-2">
              <p className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate font-semibold">{run.description}</span>
                <span className="shrink-0 text-muted">{run.agentType}</span>
              </p>
              <p className="truncate font-mono text-[11px] text-muted" title={run.activity ?? undefined}>
                {run.activity ?? "시작하는 중"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
