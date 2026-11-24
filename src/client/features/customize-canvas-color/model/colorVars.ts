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
export function customVars(scope: ColorScope, part: ColorPart, hex: string): Array<[string, string]> {
  const own: [string, string] = [customName(scope, part), hex];
  return part === "ink" ? [own, [customName(scope, "soft"), `color-mix(in oklab, ${hex} 70%, transparent)`]] : [own];
}

/** Every custom property a scope's part can set, for clearing it. */
export function customNames(scope: ColorScope, part: ColorPart): string[] {
  return customVars(scope, part, "#000000").map(([name]) => name);
}
