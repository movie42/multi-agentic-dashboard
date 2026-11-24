"use client";

import { useEffect } from "react";
import { CANVAS_COLOR_SLOTS, useCanvasColors } from "../model/useCanvasColors";

/** Sets the colours the user picked on <html>; `globals.css` prefers them over the canvas's default tokens. */
export function CanvasColorSync() {
  const [colors] = useCanvasColors();
  const signature = CANVAS_COLOR_SLOTS.map((slot) => colors[slot.key] ?? "").join(",");

  useEffect(() => {
    const root = document.documentElement.style;
    for (const slot of CANVAS_COLOR_SLOTS) {
      const name = `--canvas-${slot.key}-custom`;
      const value = colors[slot.key];
      if (value) root.setProperty(name, value);
      else root.removeProperty(name);
    }
    // `colors` is rebuilt every render; `signature` changes only when a picked colour does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}
