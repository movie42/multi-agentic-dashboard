"use client";

import { useStoredList } from "@/client/shared/lib/useStoredList";

const STORAGE_KEY = "agent-control:prompt-colors";
const HEX = /^#[0-9a-f]{6}$/i;

/** `null` means the colour from `globals.css`. */
export interface PromptColors {
  background: string | null;
  text: string | null;
}

function hexOrNull(value: string | undefined): string | null {
  return value && HEX.test(value) ? value : null;
}

export function usePromptColors(): [PromptColors, (next: PromptColors) => void] {
  const [stored, writeStored] = useStoredList(STORAGE_KEY);
  const colors = { background: hexOrNull(stored[0]), text: hexOrNull(stored[1]) };
  const write = (next: PromptColors) =>
    writeStored(next.background === null && next.text === null ? [] : [next.background ?? "", next.text ?? ""]);
  return [colors, write];
}
