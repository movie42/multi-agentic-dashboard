/**
 * Whether a wheel over `target` belongs to something inside the canvas rather than panning it:
 * a `data-scroll` panel always, a `data-scroll-overflow` box (a long memo) only while it overflows.
 */
export function keepsWheel(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-scroll]")) return true;
  const box = target.closest("[data-scroll-overflow]");
  return box !== null && box.scrollHeight > box.clientHeight;
}
