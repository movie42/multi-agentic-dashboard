"use client";

import { useEffect } from "react";
import { usePromptColors } from "../model/usePromptColors";

/** Sets the colours the user picked on <html>; `globals.css` prefers them over the `--prompt` tokens. */
export function PromptColorSync() {
  const [colors] = usePromptColors();

  useEffect(() => {
    const root = document.documentElement.style;
    const pairs = [
      ["--prompt-custom", colors.background],
      ["--prompt-ink-custom", colors.text],
    ] as const;
    for (const [name, value] of pairs) {
      if (value) root.setProperty(name, value);
      else root.removeProperty(name);
    }
  }, [colors.background, colors.text]);

  return null;
}
