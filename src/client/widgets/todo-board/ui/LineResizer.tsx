"use client";

import { useRef, useState } from "react";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import { clampSize, readSize, type SizeRange } from "../model/lineSize";

const KEY_STEP_PX = 8;

export interface StoredSize {
  value: number;
  range: SizeRange;
  /** Shows a size while dragging without writing it to storage. */
  preview: (next: number) => void;
  commit: (next: number) => void;
}

/** A px size kept in localStorage, with a live value while a drag is in progress. */
export function useStoredSize(storageKey: string, range: SizeRange): StoredSize {
  const [stored, write] = useStoredList(storageKey);
  const [live, setLive] = useState<number | null>(null);
  return {
    value: live ?? readSize(stored[0], range),
    range,
    preview: (next) => setLive(clampSize(next, range)),
    commit: (next) => {
      write([String(clampSize(next, range))]);
      setLive(null);
    },
  };
}

interface LineResizerProps {
  /** "x" resizes a width (drag left/right), "y" a height (drag up/down). */
  axis: "x" | "y";
  label: string;
  size: StoredSize;
  /** Positioning of the hit area; the visible line is centred in it. */
  className: string;
}

/** A drag edge for a width or height. Arrow keys step by 8px; a double-click restores the default. */
export function LineResizer({ axis, label, size, className }: LineResizerProps) {
  const drag = useRef<{ origin: number; start: number; current: number } | null>(null);
  const position = (event: React.PointerEvent<HTMLElement>) => (axis === "x" ? event.clientX : event.clientY);
  const end = (event: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    size.commit(active.current);
  };
  const [less, more] = axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={size.value}
      aria-valuemin={size.range.min}
      aria-valuemax={size.range.max}
      tabIndex={0}
      title="끌어서 크기 조절 · 더블클릭으로 기본값"
      onPointerDown={(event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { origin: position(event), start: size.value, current: size.value };
      }}
      onPointerMove={(event: React.PointerEvent<HTMLDivElement>) => {
        const active = drag.current;
        if (!active) return;
        active.current = clampSize(active.start + position(event) - active.origin, size.range);
        size.preview(active.current);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => size.commit(size.range.fallback)}
      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== less && event.key !== more) return;
        event.preventDefault();
        size.commit(size.value + (event.key === more ? KEY_STEP_PX : -KEY_STEP_PX));
      }}
      className={`group absolute z-20 flex touch-none outline-none ${axis === "x" ? "w-2 cursor-col-resize justify-center" : "h-2 cursor-row-resize flex-col justify-center"} ${className}`}
    >
      <div className={`transition-colors group-hover:bg-focus group-focus-visible:bg-focus group-active:bg-focus ${axis === "x" ? "h-full w-px" : "h-px w-full"}`} />
    </div>
  );
}
