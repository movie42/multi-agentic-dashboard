/** A colour input needs a hex value; with nothing picked it shows the token for the current light/dark mode. */
export function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
