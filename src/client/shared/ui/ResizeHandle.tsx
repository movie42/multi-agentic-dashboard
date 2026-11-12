"use client";

import { useEffect, useRef } from "react";

interface ResizeHandleProps {
  /** CSS custom property on <html> that holds the pane width in px, e.g. "--sidebar-w". */
  cssVar: string;
  storageKey: string;
  /** Which edge of the pane the handle sits on; dragging away from the pane grows it. */
  edge: "left" | "right";
  defaultWidth: () => number;
  min: number;
  max: () => number;
  label: string;
  /** Positioning of the 8px hit area; the visible line is centred in it. */
  className: string;
}

function readStored(key: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // Private mode or blocked storage: the width just won't survive a reload.
  }
}

export function ResizeHandle({ cssVar, storageKey, edge, defaultWidth, min, max, label, className }: ResizeHandleProps) {
  const width = useRef(0);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const apply = (next: number) => {
    width.current = Math.min(Math.max(next, min), Math.max(min, max()));
    document.documentElement.style.setProperty(cssVar, `${width.current}px`);
  };
  const latestApply = useRef(apply);
  useEffect(() => {
    latestApply.current = apply;
  });

  useEffect(() => {
    apply(readStored(storageKey) ?? defaultWidth());
    const onWindowResize = () => latestApply.current(width.current);
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
    // Mount-only: props describe a fixed pane.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    document.documentElement.removeAttribute("data-resizing");
    writeStored(storageKey, width.current);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="끌어서 크기 조절 · 더블클릭으로 기본값"
      onPointerDown={(event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: width.current };
        document.documentElement.setAttribute("data-resizing", "");
      }}
      onPointerMove={(event: React.PointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        const delta = event.clientX - drag.current.startX;
        apply(drag.current.startWidth + (edge === "right" ? delta : -delta));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => {
        apply(defaultWidth());
        writeStored(storageKey, width.current);
      }}
      className={`group z-50 flex w-2 cursor-col-resize touch-none justify-center ${className}`}
    >
      <div className="h-full w-px transition-colors group-hover:bg-focus group-active:bg-focus" />
    </div>
  );
}
