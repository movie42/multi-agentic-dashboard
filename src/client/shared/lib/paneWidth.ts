/** Current px width of a pane whose size lives in a CSS custom property on <html>. */
export function paneWidth(cssVar: string, fallback: number): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVar));
  return Number.isFinite(value) ? value : fallback;
}
