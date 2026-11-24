"use client";

import { useStoredList } from "@/client/shared/lib/useStoredList";
import { HEX, PARTS_OF, SWATCHES, type ColorPart, type SwatchName } from "./colorVars";

const STORAGE_KEY = "agent-control:canvas-item-colors";

/** One project, worktree or session card. The id is the repo, the worktree id or the session's agent id. */
export interface ItemColorTarget {
  scope: "project" | "worktree" | "card";
  id: string;
}

/** What a frame or card carries as `data-color-key`, so its own colours can reach it. */
export const colorKey = (target: ItemColorTarget) => `${target.scope}:${target.id}`;

/** A colour picked for one part, or a swatch that paints every part; a picked part wins over the swatch. */
export type ItemColor = { target: ItemColorTarget; part: ColorPart; hex: string } | { target: ItemColorTarget; part: "swatch"; swatch: SwatchName };

const SCOPES: readonly ItemColorTarget["scope"][] = ["project", "worktree", "card"];

// One entry per colour: `scope \t part \t value \t id`, the id last since it is the only free-form field.
function parseEntry(entry: string): ItemColor[] {
  const [scope, part, value, ...rest] = entry.split("\t");
  const id = rest.join("\t");
  const known = SCOPES.find((candidate) => candidate === scope);
  if (!known || !id || !value) return [];
  const target = { scope: known, id };
  if (part === "swatch") {
    const swatch = SWATCHES.find((candidate) => candidate.name === value)?.name;
    return swatch ? [{ target, part, swatch }] : [];
  }
  const ownPart = PARTS_OF[known].find((candidate) => candidate === part);
  return ownPart && HEX.test(value) ? [{ target, part: ownPart, hex: value }] : [];
}

const formatEntry = (color: ItemColor) =>
  [color.target.scope, color.part, color.part === "swatch" ? color.swatch : color.hex, color.target.id].join("\t");

const sameSpot = (a: ItemColor, target: ItemColorTarget, part?: ItemColor["part"]) =>
  a.target.scope === target.scope && a.target.id === target.id && (part === undefined || a.part === part);

export interface ItemColors {
  colors: ItemColor[];
  colorOf: (target: ItemColorTarget, part: ColorPart) => string | null;
  swatchOf: (target: ItemColorTarget) => SwatchName | null;
  /** Gives every target this part's colour. */
  paint: (targets: ItemColorTarget[], part: ColorPart, hex: string) => void;
  /** Gives every target a swatch, dropping the parts picked one by one so the swatch shows as it is. */
  paintSwatch: (targets: ItemColorTarget[], swatch: SwatchName) => void;
  /** Back to the canvas colours for these targets. */
  clear: (targets: ItemColorTarget[]) => void;
}

/**
 * Colours a person gave one project, worktree or card, on this machine. They sit above the
 * canvas-wide colours and reach every canvas the item shows on.
 *
 * `liveCards` is every session on the board: a write drops the cards that are no longer there, the
 * way the canvas drops a closed session's spot when a person changes it.
 */
export function useItemColors(liveCards?: ReadonlySet<string>): ItemColors {
  const [stored, writeStored] = useStoredList(STORAGE_KEY);
  const colors = stored.flatMap(parseEntry);
  const live = (color: ItemColor) => !liveCards || liveCards.size === 0 || color.target.scope !== "card" || liveCards.has(color.target.id);
  const write = (next: ItemColor[]) => writeStored(next.filter(live).map(formatEntry));
  return {
    colors,
    colorOf: (target, part) => {
      const found = colors.find((color) => sameSpot(color, target, part));
      return found && found.part !== "swatch" ? found.hex : null;
    },
    swatchOf: (target) => {
      const found = colors.find((color) => sameSpot(color, target, "swatch"));
      return found?.part === "swatch" ? found.swatch : null;
    },
    paint: (targets, part, hex) =>
      write([
        ...colors.filter((color) => !targets.some((target) => sameSpot(color, target, part))),
        ...targets.map((target) => ({ target, part, hex })),
      ]),
    paintSwatch: (targets, swatch) =>
      write([
        ...colors.filter((color) => !targets.some((target) => sameSpot(color, target))),
        ...targets.map((target): ItemColor => ({ target, part: "swatch", swatch })),
      ]),
    clear: (targets) => write(colors.filter((color) => !targets.some((target) => sameSpot(color, target)))),
  };
}
