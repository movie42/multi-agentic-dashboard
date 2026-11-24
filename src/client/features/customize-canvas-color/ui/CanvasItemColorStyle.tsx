"use client";

import { customVars } from "../model/colorVars";
import { colorKey, useItemColors, type ItemColor } from "../model/useItemColors";

// Ids are free-form (repo names, worktree paths), so they are escaped for a double-quoted attribute selector.
const quoted = (value: string) => `"${value.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ")}"`;

function rulesOf(colors: ItemColor[]): string {
  const byKey = new Map<string, string[]>();
  for (const { target, part, hex } of colors) {
    const declarations = customVars(target.scope, part, hex).map(([name, value]) => `${name}:${value}`);
    byKey.set(colorKey(target), [...(byKey.get(colorKey(target)) ?? []), ...declarations]);
  }
  return [...byKey].map(([key, declarations]) => `[data-color-key=${quoted(key)}]{${declarations.join(";")}}`).join("\n");
}

/**
 * The colours given to single projects, worktrees and cards, as one stylesheet keyed by each item's
 * `data-color-key`. A rule sets the same custom properties as the canvas-wide colours, on the item
 * itself, so it wins over them there and nowhere else.
 */
export function CanvasItemColorStyle() {
  const { colors } = useItemColors();
  const rules = rulesOf(colors);
  return rules ? <style>{rules}</style> : null;
}
