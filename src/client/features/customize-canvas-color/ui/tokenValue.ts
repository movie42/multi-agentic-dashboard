/** A token's value for the current light/dark mode. */
export function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const toHex = (value: number) => value.toString(16).padStart(2, "0");

/**
 * The hex a colour input needs for any CSS colour, see-through and `color-mix()` ones included: it is
 * painted over the page background on a 1×1 canvas and read back. `null` where there is no canvas.
 */
export function paintedHex(color: string): string | null {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return null;
  context.fillStyle = tokenValue("--bg") || "#ffffff";
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

/** Hex for an input, falling back to the token itself where nothing can paint. */
export function inputHex(color: string, fallbackToken: string): string {
  return paintedHex(color) ?? tokenValue(fallbackToken);
}
