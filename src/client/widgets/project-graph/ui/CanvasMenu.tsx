"use client";

import { useState } from "react";
import type { Point } from "../model/layout";

export interface MenuItem {
  label: string;
  run: () => void;
  /** Asks once more inside the menu before running (closing a session). */
  confirm?: string;
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuRename {
  label: string;
  value: string;
  onSave: (value: string) => void;
}

interface CanvasMenuProps {
  at: Point;
  zoom: number;
  title: string;
  items: MenuItem[];
  rename: MenuRename | null;
  onClose: () => void;
}

const ITEM = "w-full rounded-[6px] px-2.5 py-1.5 text-left text-[13px] hover:bg-tint disabled:opacity-30 disabled:hover:bg-transparent";

/** The right-click menu on a box or frame, kept at screen size like the other popovers. */
export function CanvasMenu({ at, zoom, title, items, rename, onClose }: CanvasMenuProps) {
  const [asking, setAsking] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const run = (item: MenuItem) => {
    if (item.confirm && asking !== item.label) {
      setAsking(item.label);
      return;
    }
    item.run();
    onClose();
  };
  const save = (value: string) => {
    if (rename && value.trim() && value.trim() !== rename.value) rename.onSave(value.trim());
    onClose();
  };
  return (
    <g transform={`translate(${at.x} ${at.y}) scale(${1 / zoom})`}>
      <foreignObject width={240} height={360} className="overflow-visible">
        <div
          role="menu"
          onContextMenu={(event: React.MouseEvent) => event.preventDefault()}
          className="flex w-[220px] flex-col rounded-[10px] bg-bg p-1 shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]"
        >
          <p className="truncate px-2.5 pt-1.5 pb-1 text-[11px] font-semibold text-muted">{title}</p>
          {renaming && rename ? (
            <input
              autoFocus
              defaultValue={rename.value}
              onBlur={(event: React.FocusEvent<HTMLInputElement>) => save(event.target.value)}
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Enter") save(event.currentTarget.value);
                if (event.key === "Escape") onClose();
              }}
              className="m-1 rounded-[6px] bg-tint px-2 py-1.5 text-[13px] outline-none"
            />
          ) : (
            rename && (
              <button type="button" role="menuitem" onClick={() => setRenaming(true)} className={ITEM}>
                {rename.label}
              </button>
            )
          )}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => run(item)}
              className={`${ITEM} ${item.danger ? "text-accent" : ""} ${asking === item.label ? "bg-accent/10 font-semibold" : ""}`}
            >
              {asking === item.label ? item.confirm : item.label}
            </button>
          ))}
        </div>
      </foreignObject>
    </g>
  );
}
