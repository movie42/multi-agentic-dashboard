import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ThemeRegistration } from "@shikijs/core";
import darkPlus from "@shikijs/themes/dark-plus";
import lightPlus from "@shikijs/themes/light-plus";

const SETTINGS_FILE =
  process.env.CURSOR_SETTINGS_FILE ?? path.join(homedir(), "Library", "Application Support", "Cursor", "User", "settings.json");

// VS Code scopes a customization block to one theme with a bracketed theme label.
const LIGHT_SCOPE = "[Default Light+]";
const DARK_SCOPE = "[Default Dark+]";

type TokenColor = NonNullable<ThemeRegistration["tokenColors"]>[number];

export interface EditorThemes {
  light: ThemeRegistration;
  dark: ThemeRegistration;
  /** Changes whenever the user's rules change, so highlighted output can be cached by it. */
  key: string;
}

const BASE: EditorThemes = { light: lightPlus, dark: darkPlus, key: "plus" };

const globalCache = globalThis as typeof globalThis & {
  __intentDiffEditorTheme?: { mtimeMs: number; themes: EditorThemes };
};

/**
 * Light+ and Dark+ with the user's own `editor.tokenColorCustomizations` from Cursor laid on top.
 * Unscoped rules are written against the light theme the user edits in, so they go on light only;
 * the dark theme takes only a block scoped to Dark+. Without a readable settings file both stay plain.
 */
export async function editorThemes(): Promise<EditorThemes> {
  const info = await stat(SETTINGS_FILE).catch(() => null);
  if (!info) return BASE;
  const cached = globalCache.__intentDiffEditorTheme;
  if (cached?.mtimeMs === info.mtimeMs) return cached.themes;

  const themes = await readFile(SETTINGS_FILE, "utf8")
    .then(buildThemes)
    .catch((error: unknown) => {
      console.warn("[editorTheme] Cursor settings unreadable, using Light+ / Dark+", error);
      return BASE;
    });
  globalCache.__intentDiffEditorTheme = { mtimeMs: info.mtimeMs, themes };
  return themes;
}

function buildThemes(text: string): EditorThemes {
  const settings: unknown = JSON.parse(stripJsonc(text));
  const custom = isRecord(settings) ? settings["editor.tokenColorCustomizations"] : undefined;
  if (!isRecord(custom)) return BASE;
  const lightRules = [...rulesOf(custom), ...rulesOf(custom[LIGHT_SCOPE])];
  const darkRules = rulesOf(custom[DARK_SCOPE]);
  if (lightRules.length === 0 && darkRules.length === 0) return BASE;

  const key = createHash("sha1").update(JSON.stringify([lightRules, darkRules])).digest("hex").slice(0, 8);
  return {
    light: withRules(lightPlus, `editor-light-${key}`, lightRules),
    dark: withRules(darkPlus, `editor-dark-${key}`, darkRules),
    key,
  };
}

function withRules(base: ThemeRegistration, name: string, rules: TokenColor[]): ThemeRegistration {
  if (rules.length === 0) return base;
  // Rules added after the theme's own win at equal scope specificity, as in the editor.
  return { ...base, name, tokenColors: [...(base.tokenColors ?? []), ...rules] };
}

function rulesOf(block: unknown): TokenColor[] {
  if (!isRecord(block) || !Array.isArray(block.textMateRules)) return [];
  return block.textMateRules.flatMap((rule: unknown): TokenColor[] => {
    if (!isRecord(rule) || !isRecord(rule.settings)) return [];
    const scope = rule.scope;
    const validScope = typeof scope === "string" || (Array.isArray(scope) && scope.every((item) => typeof item === "string"));
    if (!validScope) return [];
    const { foreground, background, fontStyle } = rule.settings;
    const settings = {
      ...(typeof foreground === "string" && { foreground }),
      ...(typeof background === "string" && { background }),
      ...(typeof fontStyle === "string" && { fontStyle }),
    };
    return Object.keys(settings).length > 0 ? [{ scope, settings }] : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The editor's settings file is JSON with comments and trailing commas. */
function stripJsonc(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      out += char;
      if (char === "\\") out += text[++i] ?? "";
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else if (char === ",") {
      let next = i + 1;
      while (next < text.length && /\s/.test(text[next])) next++;
      const rest = stripLeadingComments(text.slice(next));
      if (rest[0] !== "}" && rest[0] !== "]") out += char;
    } else {
      out += char;
    }
  }
  return out;
}

function stripLeadingComments(text: string): string {
  let rest = text.trimStart();
  while (rest.startsWith("//") || rest.startsWith("/*")) {
    const end = rest.startsWith("//") ? rest.indexOf("\n") : rest.indexOf("*/") + 1;
    if (end <= 0) return "";
    rest = rest.slice(end + 1).trimStart();
  }
  return rest;
}
