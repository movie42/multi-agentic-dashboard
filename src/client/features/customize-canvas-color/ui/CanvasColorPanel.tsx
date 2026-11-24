"use client";

import { useState } from "react";
import { CANVAS_COLOR_SLOTS, DEFAULT_CANVAS_COLORS, useCanvasColors, type CanvasColorSlot } from "../model/useCanvasColors";

function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const TARGETS = [...new Set(CANVAS_COLOR_SLOTS.map((slot) => slot.target))];
const PARTS: CanvasColorSlot["part"][] = ["라인", "배경"];

function CanvasColorEditor() {
  const [colors, write] = useCanvasColors();
  const customized = CANVAS_COLOR_SLOTS.some((slot) => colors[slot.key] !== null);

  return (
    <div className="mt-2 flex flex-col gap-2.5 rounded-[8px] bg-bg p-2.5">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1.5">
        <span />
        {PARTS.map((part) => (
          <span key={part} className="w-9 text-center text-[11px] text-muted">
            {part}
          </span>
        ))}
        {TARGETS.map((target) => (
          <div key={target} className="contents">
            <span className="text-muted">{target}</span>
            {PARTS.map((part) => {
              const slot = CANVAS_COLOR_SLOTS.find((candidate) => candidate.target === target && candidate.part === part);
              if (!slot) return <span key={part} />;
              return (
                <input
                  key={part}
                  type="color"
                  value={colors[slot.key] ?? tokenValue(slot.token)}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => write({ ...colors, [slot.key]: event.target.value })}
                  aria-label={`${target} ${part} 색`}
                  className="h-6 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-muted">세션 상태 색(내 차례 · 작업 중 · 쉬는 중 · 잠자는 중)은 바뀌지 않아요.</p>
      {customized && (
        <button
          type="button"
          onClick={() => write(DEFAULT_CANVAS_COLORS)}
          className="self-start rounded-full px-2.5 py-1 text-[12px] font-semibold text-muted hover:text-fg"
        >
          기본 색으로
        </button>
      )}
    </div>
  );
}

export function CanvasColorPanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-4 text-[12px]" aria-label="캔버스 색">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-muted hover:text-fg"
      >
        <span className="font-bold tracking-[0.04em]">캔버스 색</span>
        <span className="size-3 rounded-[3px] bg-canvas shadow-[inset_0_0_0_1.5px_var(--color-canvas-worktree-line)]" aria-hidden />
        <span className="ml-auto" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && <CanvasColorEditor />}
    </section>
  );
}
