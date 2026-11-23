"use client";

import { useState } from "react";
import { MenuItem, type MenuPoint } from "./ContextMenu";

export interface MenuGroupEntry {
  label: string;
  /** Keyed `MenuItem`s; falsy entries are dropped. */
  items: React.ReactNode[];
}

interface MenuGroupsProps {
  /** Where the menu was opened, to open the second level to the left near the right edge. */
  at: MenuPoint;
  groups: MenuGroupEntry[];
}

const MENU_W = 240;
const PANEL =
  "absolute top-0 z-10 flex w-60 flex-col rounded-[12px] bg-bg p-1.5 text-[13px] shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]";

/**
 * The first level of a context menu: one row per group that opens its items to the side on hover or
 * click. A group with a single item shows that item in place; an empty group is left out.
 */
export function MenuGroups({ at, groups }: MenuGroupsProps) {
  const [open, setOpen] = useState<string | null>(null);
  const flip = typeof window !== "undefined" && at.x + MENU_W * 2 > window.innerWidth;
  return groups.map((group) => {
    const items = group.items.filter(Boolean);
    if (items.length === 0) return null;
    if (items.length === 1) {
      return (
        <div key={group.label} className="flex flex-col" onMouseEnter={() => setOpen(null)}>
          {items[0]}
        </div>
      );
    }
    const expanded = open === group.label;
    return (
      <div key={group.label} className="relative flex flex-col" onMouseEnter={() => setOpen(group.label)}>
        <MenuItem hint="›" onSelect={() => setOpen(group.label)}>
          <span className={expanded ? "font-semibold" : ""}>{group.label}</span>
        </MenuItem>
        {expanded && (
          <div role="menu" aria-label={group.label} className={`${PANEL} ${flip ? "right-full mr-1.5" : "left-full ml-1.5"}`}>
            {items}
          </div>
        )}
      </div>
    );
  });
}
