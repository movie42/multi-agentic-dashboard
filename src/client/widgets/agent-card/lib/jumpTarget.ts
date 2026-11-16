const FOLLOW_MS = 2_000;
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown"] as const;

function scrollToTarget(card: HTMLElement): void {
  const focus = card.querySelector<HTMLElement>("[data-jump-focus]");
  if (focus) focus.scrollIntoView({ block: "center" });
  else card.scrollIntoView({ block: "end" });
}

/**
 * Brings what the user has to answer into view: the question card when one is open, otherwise the
 * card's end where the reply box sits. The conversation can still be loading, so the scroll is
 * repeated while the card grows, until the user scrolls themselves or a short time passes.
 */
export function followJumpTarget(card: HTMLElement): () => void {
  scrollToTarget(card);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => scrollToTarget(card));
  observer?.observe(card);
  const stop = () => {
    observer?.disconnect();
    clearTimeout(timer);
    for (const event of USER_SCROLL_EVENTS) window.removeEventListener(event, stop);
  };
  const timer = setTimeout(stop, FOLLOW_MS);
  for (const event of USER_SCROLL_EVENTS) window.addEventListener(event, stop, { passive: true });
  return stop;
}
