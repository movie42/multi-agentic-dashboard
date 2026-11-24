"use client";

import { useStoredList } from "@/client/shared/lib/useStoredList";

const STORAGE_KEY = "agent-control:canvas-colors";
const HEX = /^#[0-9a-f]{6}$/i;

export interface CanvasColorSlot {
  key: "bg" | "project-line" | "project-fill" | "worktree-line" | "worktree-fill" | "card";
  target: string;
  part: "라인" | "배경";
  /** The token the canvas falls back to; a colour input needs a hex, so this is what it shows with nothing picked. */
  token: string;
}

export type CanvasColorKey = CanvasColorSlot["key"];

/**
 * Stored by position, so the order is part of the storage format. Session-state colours (a card's
 * border, the dot beside its state) are left out on purpose.
 */
export const CANVAS_COLOR_SLOTS: readonly CanvasColorSlot[] = [
  { key: "bg", target: "캔버스", part: "배경", token: "--bg" },
  { key: "project-line", target: "프로젝트", part: "라인", token: "--hair" },
  { key: "project-fill", target: "프로젝트", part: "배경", token: "--tint" },
  { key: "worktree-line", target: "워크트리", part: "라인", token: "--faint" },
  { key: "worktree-fill", target: "워크트리", part: "배경", token: "--tint" },
  { key: "card", target: "카드", part: "배경", token: "--bg" },
];

/** `null` means the colour from `globals.css`. */
export type CanvasColors = Record<CanvasColorKey, string | null>;

export const DEFAULT_CANVAS_COLORS: CanvasColors = {
  bg: null,
  "project-line": null,
  "project-fill": null,
  "worktree-line": null,
  "worktree-fill": null,
  card: null,
};

function hexOrNull(value: string | undefined): string | null {
  return value && HEX.test(value) ? value : null;
}

export function useCanvasColors(): [CanvasColors, (next: CanvasColors) => void] {
  const [stored, writeStored] = useStoredList(STORAGE_KEY);
  const colors = CANVAS_COLOR_SLOTS.reduce<CanvasColors>(
    (picked, slot, index) => ({ ...picked, [slot.key]: hexOrNull(stored[index]) }),
    DEFAULT_CANVAS_COLORS,
  );
  const write = (next: CanvasColors) => {
    const values = CANVAS_COLOR_SLOTS.map((slot) => next[slot.key] ?? "");
    writeStored(values.every((value) => value === "") ? [] : values);
  };
  return [colors, write];
}
