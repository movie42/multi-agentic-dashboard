export type ColorScope = "canvas" | "project" | "worktree" | "card";
export type ColorPart = "line" | "fill" | "ink";

export const HEX = /^#[0-9a-f]{6}$/i;

export const PART_LABEL: Record<ColorPart, string> = { line: "라인", fill: "배경", ink: "글자" };
export const SCOPE_LABEL: Record<ColorScope, string> = { canvas: "캔버스", project: "프로젝트", worktree: "워크트리", card: "카드" };

/**
 * What each scope lets a person recolour. A card has no line: its border is the session state's
 * colour (내 차례 · 작업 중 · 쉬는 중 · 잠자는 중).
 */
export const PARTS_OF: Record<ColorScope, readonly ColorPart[]> = {
  canvas: ["fill"],
  project: ["line", "fill", "ink"],
  worktree: ["line", "fill", "ink"],
  card: ["fill", "ink"],
};

/** The `globals.css` token each part falls back to; a colour input needs a hex, so this is what it shows with nothing picked. */
export const DEFAULT_TOKEN: Record<ColorScope, Partial<Record<ColorPart, string>>> = {
  canvas: { fill: "--bg" },
  project: { line: "--hair", fill: "--tint", ink: "--fg" },
  worktree: { line: "--faint", fill: "--tint", ink: "--fg" },
  card: { fill: "--bg", ink: "--fg" },
};

const customName = (scope: ColorScope, part: ColorPart | "soft") => (scope === "canvas" ? "--canvas-bg-custom" : `--canvas-${scope}-${part}-custom`);

/**
 * The custom properties one picked colour sets; `globals.css` prefers them over the default tokens.
 * A text colour also sets a dimmer one for the secondary text that is `muted` by default.
 */
export function customVars(scope: ColorScope, part: ColorPart, color: string): Array<[string, string]> {
  const own: [string, string] = [customName(scope, part), color];
  return part === "ink" ? [own, [customName(scope, "soft"), `color-mix(in oklab, ${color} 70%, transparent)`]] : [own];
}

/** `dot` is spelled out per swatch so Tailwind sees the class. */
export const SWATCHES = [
  { name: "red", label: "빨강", dot: "bg-swatch-red" },
  { name: "orange", label: "주황", dot: "bg-swatch-orange" },
  { name: "yellow", label: "노랑", dot: "bg-swatch-yellow" },
  { name: "green", label: "초록", dot: "bg-swatch-green" },
  { name: "teal", label: "청록", dot: "bg-swatch-teal" },
  { name: "blue", label: "파랑", dot: "bg-swatch-blue" },
  { name: "violet", label: "보라", dot: "bg-swatch-violet" },
  { name: "gray", label: "회색", dot: "bg-swatch-gray" },
] as const;

export type SwatchName = (typeof SWATCHES)[number]["name"];

/**
 * One swatch paints every part a scope has. Background and text are mixed from the swatch's hue with
 * `--bg` / `--fg`, so the same swatch reads right in light and dark mode.
 */
export function swatchVars(scope: ColorScope, name: SwatchName): Array<[string, string]> {
  const hue = `var(--swatch-${name})`;
  const color: Record<ColorPart, string> = {
    line: hue,
    fill: `color-mix(in oklab, ${hue} 14%, var(--bg))`,
    ink: `color-mix(in oklab, ${hue} 55%, var(--fg))`,
  };
  return PARTS_OF[scope].flatMap((part) => customVars(scope, part, color[part]));
}

/** Every custom property a scope's part can set, for clearing it. */
export function customNames(scope: ColorScope, part: ColorPart): string[] {
  return customVars(scope, part, "#000000").map(([name]) => name);
}
