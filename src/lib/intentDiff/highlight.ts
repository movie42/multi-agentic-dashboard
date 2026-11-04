import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHighlighterCore, type HighlighterCore } from "@shikijs/core";
import { createOnigurumaEngine } from "@shikijs/engine-oniguruma";
import { editorThemes, type EditorThemes } from "./editorTheme";
import { readBlobs } from "./gitDiff";
import type { DiffRange, FileDiff, SymbolLocation, SymbolLookup } from "./types";

const MAX_BYTES = 400 * 1024;
const CACHE_ENTRIES = 400;

type Lang = "typescript" | "tsx" | "javascript" | "jsx" | "json" | "css" | "markdown" | "html" | "yaml" | "shellscript";

const LANG_BY_EXTENSION: Record<string, Lang> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".css": "css",
  ".md": "markdown",
  ".html": "html",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".sh": "shellscript",
};

const KEYWORDS = new Set(
  (
    "abstract as async await boolean break case catch class const continue declare default delete do else enum export extends " +
    "false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never " +
    "new null number object of package private protected public readonly return satisfies set static string super switch symbol " +
    "this throw true try type typeof undefined unique unknown var void while with yield any bigint"
  ).split(" "),
);
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const globalCache = globalThis as typeof globalThis & {
  __intentDiffHighlighter?: Promise<HighlighterCore>;
  __intentDiffHighlighted?: Map<string, string[]>;
};
globalCache.__intentDiffHighlighted ??= new Map();
const highlighted = globalCache.__intentDiffHighlighted;

// The core packages are imported one grammar at a time: the `shiki` entry is kept external by
// Next.js and the standalone build does not carry it, so the production server could not load it.
function highlighter(): Promise<HighlighterCore> {
  globalCache.__intentDiffHighlighter ??= createHighlighterCore({
    themes: [import("@shikijs/themes/light-plus"), import("@shikijs/themes/dark-plus")],
    langs: [
      import("@shikijs/langs/typescript"),
      import("@shikijs/langs/tsx"),
      import("@shikijs/langs/javascript"),
      import("@shikijs/langs/jsx"),
      import("@shikijs/langs/json"),
      import("@shikijs/langs/css"),
      import("@shikijs/langs/markdown"),
      import("@shikijs/langs/html"),
      import("@shikijs/langs/yaml"),
      import("@shikijs/langs/shellscript"),
    ],
    // The JavaScript regex engine mis-splits tokens on the first lines it sees after start-up
    // (`total = 1;` came out as one constant token), so the reference Oniguruma engine is used.
    engine: createOnigurumaEngine(import("@shikijs/engine-oniguruma/wasm-inlined")),
  });
  return globalCache.__intentDiffHighlighter;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function langOf(file: string): Lang | null {
  return LANG_BY_EXTENSION[path.posix.extname(file)] ?? null;
}

/**
 * One markup string per line. Colors come from the editor themes (Light+ / Dark+ with the user's
 * Cursor color rules) as the `--shiki-light` / `--shiki-dark` custom properties, so the page picks
 * one with a CSS rule.
 */
export async function highlightLines(code: string, file: string): Promise<string[]> {
  const lang = langOf(file);
  if (!lang || code.length > MAX_BYTES) return code.split("\n").map(escapeHtml);
  const themes = await editorThemes();
  // Tokenizing is the slow part of a request and most files do not change between requests.
  const key = createHash("sha1").update(themes.key).update("\0").update(lang).update("\0").update(code).digest("hex");
  const cached = highlighted.get(key);
  if (cached) return cached;
  const lines = await tokenize(code, lang, themes);
  if (highlighted.size >= CACHE_ENTRIES) highlighted.delete(highlighted.keys().next().value as string);
  highlighted.set(key, lines);
  return lines;
}

async function tokenize(code: string, lang: Lang, themes: EditorThemes): Promise<string[]> {
  const core = await highlighter();
  const loaded = core.getLoadedThemes();
  const missing = [themes.light, themes.dark].filter((theme) => !loaded.includes(theme.name ?? ""));
  if (missing.length > 0) await core.loadTheme(...missing);
  const { tokens } = core.codeToTokens(code, {
    lang,
    themes: { light: themes.light.name ?? "", dark: themes.dark.name ?? "" },
    defaultColor: false,
  });
  return tokens.map((line) =>
    line
      .map((token) => {
        const style = Object.entries(token.htmlStyle ?? {})
          .map(([key, value]) => `${key}:${value}`)
          .join(";");
        const lookup = IDENTIFIER.test(token.content) && !KEYWORDS.has(token.content);
        const attrs = lookup ? ` class="sym" data-col="${token.offset - lineStart(code, token.offset)}"` : "";
        return `<span${attrs} style="${style}">${escapeHtml(token.content)}</span>`;
      })
      .join(""),
  );
}

function lineStart(code: string, offset: number): number {
  return code.lastIndexOf("\n", offset - 1) + 1;
}

export interface FileText {
  lines: string[];
  html: string[];
}

/**
 * Highlights both sides of every text diff so each line keeps the colors it has in its whole
 * file, and returns the end-side text of each file for code shown outside the hunks.
 */
export async function highlightDiffs(range: DiffRange, files: FileDiff[]): Promise<Map<string, FileText>> {
  const readable = files.filter((file) => !file.binary && file.hunks.some((hunk) => hunk.lines.length > 0));
  const endSpec = (file: FileDiff) => `${range.head}:${file.file}`;
  const oldSpec = (file: FileDiff) => `${range.base}:${file.oldFile ?? file.file}`;
  const needsOld = (file: FileDiff) => file.hunks.some((hunk) => hunk.lines.some((line) => line.kind === "del"));
  const blobs = await readBlobs(range.worktreePath, [
    ...readable.filter(needsOld).map(oldSpec),
    ...(range.head ? readable.filter((file) => file.change !== "deleted").map(endSpec) : []),
  ]);

  const endTexts = new Map<string, FileText>();
  await Promise.all(
    readable.map(async (file) => {
      const endCode =
        file.change === "deleted"
          ? null
          : range.head
            ? (blobs.get(endSpec(file)) ?? null)
            : await readFile(path.join(range.worktreePath, file.file), "utf8").catch(() => null);
      const oldCode = needsOld(file) ? (blobs.get(oldSpec(file)) ?? null) : null;
      const endHtml = endCode !== null ? await highlightLines(endCode, file.file) : null;
      const oldHtml = oldCode !== null ? await highlightLines(oldCode, file.file) : null;
      if (endCode !== null && endHtml) endTexts.set(file.file, { lines: endCode.split("\n"), html: endHtml });
      for (const line of file.hunks.flatMap((hunk) => hunk.lines)) {
        const html = line.newNo !== null ? endHtml?.[line.newNo - 1] : line.oldNo !== null ? oldHtml?.[line.oldNo - 1] : undefined;
        if (html !== undefined) line.html = html;
      }
    }),
  );
  return endTexts;
}

const SPAN = /<span([^>]*)>([^<]*)<\/span>/g;

/** Drops a line's indentation from its markup, to match the trimmed `text` of a location. */
function trimIndent(html: string): string {
  let leading = true;
  return html.replace(SPAN, (whole, attrs: string, content: string) => {
    if (!leading) return whole;
    const rest = content.replace(/^(?:[ \t]|&nbsp;)+/, "");
    if (rest === "") return "";
    leading = false;
    return `<span${attrs}>${rest}</span>`;
  });
}

/**
 * Colors the panel's code the way the diff colors it. A file in the repository is highlighted whole
 * so each line keeps its context; a file under node_modules only by its snippet.
 */
export async function highlightLookup(root: string, lookup: SymbolLookup): Promise<void> {
  const fileHtml = new Map<string, Promise<string[] | null>>();
  const linesOf = (file: string) => {
    let pending = fileHtml.get(file);
    if (!pending) {
      pending = readFile(path.join(root, file), "utf8")
        .then((code) => highlightLines(code, file))
        .catch(() => null);
      fileHtml.set(file, pending);
    }
    return pending;
  };

  const fill = async (location: SymbolLocation) => {
    const { startLine, lines } = location.snippet;
    const html = location.external
      ? await highlightLines(lines.join("\n"), location.file)
      : (await linesOf(location.file))?.slice(startLine - 1, startLine - 1 + lines.length);
    if (!html || html.length !== lines.length) return;
    location.snippet.html = html;
    const own = html[location.line - startLine];
    if (own !== undefined) location.html = trimIndent(own);
  };

  await Promise.all([
    ...[...lookup.definitions, ...lookup.references].map(fill),
    lookup.signature
      ? highlightLines(lookup.signature, "signature.ts").then((html) => {
          lookup.signatureHtml = html.join("\n");
        })
      : null,
  ]);
}
