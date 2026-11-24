"use client";

import { useEffect } from "react";
import { customNames, customVars } from "../model/colorVars";
import { CANVAS_COLOR_SLOTS, useCanvasColors } from "../model/useCanvasColors";

/** Sets the canvas-wide colours the user picked on <html>; `globals.css` prefers them over the default tokens. */
export function CanvasColorSync() {
  const [colors] = useCanvasColors();
  const signature = colors.join(",");

  useEffect(() => {
    const root = document.documentElement.style;
    CANVAS_COLOR_SLOTS.forEach(({ scope, part }, index) => {
      const hex = colors[index];
      if (hex) customVars(scope, part, hex).forEach(([name, value]) => root.setProperty(name, value));
      else customNames(scope, part).forEach((name) => root.removeProperty(name));
    });
    // `colors` is rebuilt every render; `signature` changes only when a picked colour does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}
