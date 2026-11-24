"use client";

import { useStoredList } from "@/client/shared/lib/useStoredList";
import { HEX, type ColorPart, type ColorScope } from "./colorVars";

const STORAGE_KEY = "agent-control:canvas-colors";

export interface CanvasColorSlot {
  scope: ColorScope;
  part: ColorPart;
}

/**
 * Stored by position, so the order is part of the storage format: new slots go at the end.
 * Session-state colours (a card's border, the dot beside its state) are left out on purpose.
 */
export const CANVAS_COLOR_SLOTS: readonly CanvasColorSlot[] = [
  { scope: "canvas", part: "fill" },
  { scope: "project", part: "line" },
  { scope: "project", part: "fill" },
  { scope: "worktree", part: "line" },
  { scope: "worktree", part: "fill" },
  { scope: "card", part: "fill" },
  { scope: "project", part: "ink" },
  { scope: "worktree", part: "ink" },
  { scope: "card", part: "ink" },
];

/** By slot position; `null` means the colour from `globals.css`. */
export type CanvasColors = Array<string | null>;

export const slotIndex = (scope: ColorScope, part: ColorPart) =>
  CANVAS_COLOR_SLOTS.findIndex((slot) => slot.scope === scope && slot.part === part);

function hexOrNull(value: string | undefined): string | null {
  return value && HEX.test(value) ? value : null;
}

/** The colours picked for the whole canvas, under any one project's, worktree's or card's own. */
export function useCanvasColors(): [CanvasColors, (next: CanvasColors) => void] {
  const [stored, writeStored] = useStoredList(STORAGE_KEY);
  const colors = CANVAS_COLOR_SLOTS.map((_, index) => hexOrNull(stored[index]));
  const write = (next: CanvasColors) => {
    const values = CANVAS_COLOR_SLOTS.map((_, index) => next[index] ?? "");
    writeStored(values.every((value) => value === "") ? [] : values);
  };
  return [colors, write];
}
