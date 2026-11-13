"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

export interface MenuPoint {
  x: number;
  y: number;
}

interface ContextMenuProps {
  at: MenuPoint;
  label: string;
  onClose: () => void;
  /** Width class; menus default to a narrow column. */
  widthClass?: string;
  children: React.ReactNode;
}

const EDGE_GAP = 8;

/** A menu pinned at the pointer, nudged back inside the viewport, closed by an outside click, Esc, scroll or resize. */
export function ContextMenu({ at, label, onClose, widthClass = "w-56", children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const x = Math.max(EDGE_GAP, Math.min(at.x, window.innerWidth - width - EDGE_GAP));
    const y = Math.max(EDGE_GAP, Math.min(at.y, window.innerHeight - height - EDGE_GAP));
    menu.style.setProperty("--menu-x", `${x}px`);
    menu.style.setProperty("--menu-y", `${y}px`);
    menu.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus({ preventScroll: true });
  }, [at.x, at.y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      closeRef.current();
    };
    const onResize = () => closeRef.current();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onMouseDown={onClose}
        onContextMenu={(event: React.MouseEvent<HTMLDivElement>) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        onContextMenu={(event: React.MouseEvent<HTMLDivElement>) => event.preventDefault()}
        className={`fixed top-(--menu-y) left-(--menu-x) z-50 flex ${widthClass} flex-col rounded-[12px] bg-bg p-1.5 text-[13px] shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]`}
      >
        {children}
      </div>
    </>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  hint?: string;
  /** A line under the label saying what the item does. */
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function MenuItem({ onSelect, tone = "default", disabled, hint, description, icon, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={`flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left outline-none hover:bg-tint focus-visible:bg-tint disabled:opacity-40 disabled:hover:bg-transparent ${
        tone === "danger" ? "text-accent" : ""
      }`}
    >
      <span className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-px shrink-0 text-muted">{icon}</span>}
        <span className="min-w-0">
          <span className="block">{children}</span>
          {description && <span className="block text-[12px] leading-snug text-muted">{description}</span>}
        </span>
      </span>
      {hint && <span className="shrink-0 text-[12px] text-muted">{hint}</span>}
    </button>
  );
}

interface MenuHeadingProps {
  children: React.ReactNode;
}

export function MenuHeading({ children }: MenuHeadingProps) {
  return <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-muted">{children}</p>;
}

export function MenuSeparator() {
  return <hr role="separator" className="my-1 border-hair" />;
}
