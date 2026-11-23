"use client";

import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { ContextMenu, MenuHeading, MenuItem as MenuRow, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";

export interface MenuItem {
  label: string;
  run: () => void;
  /** Asks once more inside the menu before running (closing a session). */
  confirm?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Replaces the menu with this list instead of running; `run` is not called. */
  children?: MenuItem[];
  /** Muted second line, for telling apart entries with the same label. */
  hint?: string;
  /** Defaults to the label; set it when labels can repeat. */
  key?: string;
}

export interface MenuRename {
  label: string;
  value: string;
  onSave: (value: string) => void;
}

interface CanvasMenuProps {
  /** Where the pointer was, in screen pixels. */
  at: MenuPoint;
  title: string;
  heading?: string;
  sections: MenuItem[][];
  rename: MenuRename | null;
  onClose: () => void;
}

/** The right-click menu on a box, frame or line: the app's shared context menu, one line between sections. */
export function CanvasMenu({ at, title, heading, sections, rename, onClose }: CanvasMenuProps) {
  const [asking, setAsking] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [submenu, setSubmenu] = useState<MenuItem | null>(null);
  const run = (item: MenuItem) => {
    if (item.children) {
      setSubmenu(item);
      return;
    }
    const key = item.key ?? item.label;
    if (item.confirm && asking !== key) {
      setAsking(key);
      return;
    }
    item.run();
    onClose();
  };
  const save = (value: string) => {
    if (rename && value.trim() && value.trim() !== rename.value) rename.onSave(value.trim());
    onClose();
  };
  const row = (item: MenuItem) => {
    const key = item.key ?? item.label;
    return (
      <MenuRow key={key} tone={item.danger ? "danger" : "default"} disabled={item.disabled} description={item.hint} onSelect={() => run(item)}>
        {asking === key ? <span className="font-semibold">{item.confirm}</span> : item.label}
      </MenuRow>
    );
  };

  // Portaled so the menu keeps screen size at any zoom and is not clipped by the canvas.
  return createPortal(
    <ContextMenu at={at} label={`${title} 메뉴`} onClose={onClose} widthClass="w-60 max-h-[calc(100dvh-16px)] overflow-y-auto">
      {submenu ? (
        <>
          <button type="button" onClick={() => setSubmenu(null)} className="truncate px-2.5 pt-1 pb-1.5 text-left text-[11px] font-semibold text-muted hover:text-fg">
            ‹ {submenu.label}
          </button>
          {submenu.children?.map(row)}
        </>
      ) : (
        <>
          {heading && <MenuHeading>{heading}</MenuHeading>}
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
            rename && <MenuRow onSelect={() => setRenaming(true)}>{rename.label}</MenuRow>
          )}
          {sections.map((section, index) => (
            <Fragment key={section[0]?.key ?? section[0]?.label ?? index}>
              {(index > 0 || rename) && <MenuSeparator />}
              {section.map(row)}
            </Fragment>
          ))}
        </>
      )}
    </ContextMenu>,
    document.body,
  );
}
