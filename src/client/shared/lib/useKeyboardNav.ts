"use client";

import { useEffect } from "react";

const CARD = "[data-card]";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(CARD)].filter((card) => card.offsetParent !== null);
}

function currentCard(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>(CARD) : null;
}

function moveFocus(step: number) {
  const list = cards();
  if (list.length === 0) return;
  const current = currentCard();
  const index = current ? list.indexOf(current) : -1;
  const next = list[index < 0 ? (step > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, index + step))];
  next.focus();
  next.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function clickIn(selector: string) {
  currentCard()?.querySelector<HTMLElement>(selector)?.click();
}

export function useKeyboardNav() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) {
        if (event.key !== "Escape") return;
        const card = currentCard();
        if (card) card.focus();
        else if (event.target instanceof HTMLElement) event.target.blur();
        return;
      }
      const actions: Record<string, () => void> = {
        KeyJ: () => moveFocus(1),
        KeyK: () => moveFocus(-1),
        KeyR: () => currentCard()?.querySelector<HTMLElement>("[data-quick-reply]")?.focus(),
        KeyO: () => clickIn("[data-open-artifact]"),
        KeyE: () => clickIn("[data-continue]"),
      };
      const action = actions[event.code];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
