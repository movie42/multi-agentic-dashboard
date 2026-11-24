"use client";

import { useState } from "react";
import { DEFAULT_TOKEN, PART_LABEL, PARTS_OF, SCOPE_LABEL, type ColorPart, type ColorScope } from "../model/colorVars";
import { CANVAS_COLOR_SLOTS, slotIndex, useCanvasColors } from "../model/useCanvasColors";
import { tokenValue } from "./tokenValue";

const SCOPES: readonly ColorScope[] = ["canvas", "project", "worktree", "card"];
const PARTS: readonly ColorPart[] = ["line", "fill", "ink"];

function CanvasColorEditor() {
  const [colors, write] = useCanvasColors();
  const customized = colors.some((color) => color !== null);
  const pick = (scope: ColorScope, part: ColorPart, hex: string) => write(colors.map((color, index) => (index === slotIndex(scope, part) ? hex : color)));

  return (
    <div className="mt-2 flex flex-col gap-2.5 rounded-[8px] bg-bg p-2.5">
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2.5 gap-y-1.5">
        <span />
        {PARTS.map((part) => (
          <span key={part} className="w-8 text-center text-[11px] text-muted">
            {PART_LABEL[part]}
          </span>
        ))}
        {SCOPES.map((scope) => (
          <div key={scope} className="contents">
            <span className="text-muted">{SCOPE_LABEL[scope]}</span>
            {PARTS.map((part) => {
              if (!PARTS_OF[scope].includes(part)) return <span key={part} />;
              return (
                <input
                  key={part}
                  type="color"
                  value={colors[slotIndex(scope, part)] ?? tokenValue(DEFAULT_TOKEN[scope][part] ?? "--fg")}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => pick(scope, part, event.target.value)}
                  aria-label={`${SCOPE_LABEL[scope]} ${PART_LABEL[part]} 색`}
                  className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-muted">
        캔버스 전체에 적용돼요. 하나만 바꾸려면 캔버스에서 우클릭 → 정리 → 색 바꾸기. 세션 상태 색(내 차례 · 작업 중 · 쉬는 중 · 잠자는 중)은 바뀌지 않아요.
      </p>
      {customized && (
        <button
          type="button"
          onClick={() => write(CANVAS_COLOR_SLOTS.map(() => null))}
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
