"use client";

import { useStoredList } from "@/client/shared/lib/useStoredList";
import { HEX, PARTS_OF, type ColorPart } from "./colorVars";

const STORAGE_KEY = "agent-control:canvas-item-colors";

/** One project, worktree or session card. The id is the repo, the worktree id or the session's agent id. */
export interface ItemColorTarget {
  scope: "project" | "worktree" | "card";
  id: string;
}

/** What a frame or card carries as `data-color-key`, so its own colours can reach it. */
export const colorKey = (target: ItemColorTarget) => `${target.scope}:${target.id}`;

export interface ItemColor {
  target: ItemColorTarget;
  part: ColorPart;
  hex: string;
}

const SCOPES: readonly ItemColorTarget["scope"][] = ["project", "worktree", "card"];

// One entry per colour: `scope \t part \t hex \t id`, the id last since it is the only free-form field.
function parseEntry(entry: string): ItemColor[] {
  const [scope, part, hex, ...rest] = entry.split("\t");
  const id = rest.join("\t");
  const known = SCOPES.find((candidate) => candidate === scope);
  const ownPart = known && PARTS_OF[known].find((candidate) => candidate === part);
  return known && ownPart && hex && HEX.test(hex) && id ? [{ target: { scope: known, id }, part: ownPart, hex }] : [];
}

const formatEntry = ({ target, part, hex }: ItemColor) => [target.scope, part, hex, target.id].join("\t");

const sameSpot = (a: ItemColor, target: ItemColorTarget, part?: ColorPart) =>
  a.target.scope === target.scope && a.target.id === target.id && (part === undefined || a.part === part);

export interface ItemColors {
  colors: ItemColor[];
  colorOf: (target: ItemColorTarget, part: ColorPart) => string | null;
  /** Gives every target this part's colour. */
  paint: (targets: ItemColorTarget[], part: ColorPart, hex: string) => void;
  /** Back to the canvas colours for these targets. */
  clear: (targets: ItemColorTarget[]) => void;
}

/**
 * Colours a person gave one project, worktree or card, on this machine. They sit above the
 * canvas-wide colours and reach every canvas the item shows on.
 */
export function useItemColors(): ItemColors {
  const [stored, writeStored] = useStoredList(STORAGE_KEY);
  const colors = stored.flatMap(parseEntry);
  const write = (next: ItemColor[]) => writeStored(next.map(formatEntry));
  return {
    colors,
    colorOf: (target, part) => colors.find((color) => sameSpot(color, target, part))?.hex ?? null,
    paint: (targets, part, hex) =>
      write([
        ...colors.filter((color) => !targets.some((target) => sameSpot(color, target, part))),
        ...targets.map((target) => ({ target, part, hex })),
      ]),
    clear: (targets) => write(colors.filter((color) => !targets.some((target) => sameSpot(color, target)))),
  };
}
