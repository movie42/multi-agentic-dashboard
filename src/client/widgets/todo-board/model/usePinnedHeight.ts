"use client";

import { useEffect, type RefObject } from "react";

/**
 * Publishes the pinned block's height as `--todo-pinned-h` on `root`, so the calendar's week headers stick right
 * under it. The height changes with the toolbar wrapping and with the overdue tray appearing, so it is measured.
 */
export function usePinnedHeight(pinnedRef: RefObject<HTMLElement | null>, rootRef: RefObject<HTMLElement | null>, ready: boolean): void {
  useEffect(() => {
    const pinned = pinnedRef.current;
    const root = rootRef.current;
    if (!ready || !pinned || !root || typeof ResizeObserver === "undefined") return;
    const sync = () => root.style.setProperty("--todo-pinned-h", `${pinned.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(pinned);
    return () => observer.disconnect();
  }, [pinnedRef, rootRef, ready]);
}
