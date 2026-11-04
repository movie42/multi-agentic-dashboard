import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHighlighterCore, type HighlighterCore } from "@shikijs/core";
import { createOnigurumaEngine } from "@shikijs/engine-oniguruma";
import { LRUCache } from "lru-cache";
import type { EditorThemes } from "@/lib/intentDiff/editorTheme";
import type { DiffRange, FileDiff, SymbolLocation, SymbolLookup } from "@/lib/intentDiff/types";
import { isMissing, type Warn } from "./report";

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
const SPAN = /<span([^>]*)>([^<]*)<\/span>/g;

export interface FileText {
  lines: string[];
  html: string[];
}

export type ReadBlobs = (cwd: string, specs: string[]) => Promise<Map<string, string | null>>;

export interface HighlighterDeps {
  themes: () => Promise<EditorThemes>;
  readBlobs: ReadBlobs;
  warn: Warn;
  createCore?: () => Promise<HighlighterCore>;
  max?: number;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function langOf(file: string): Lang | null {
  return LANG_BY_EXTENSION[path.posix.extname(file)] ?? null;
}

function lineStart(code: string, offset: number): number {
  return code.lastIndexOf("\n", offset - 1) + 1;
}

export function trimIndent(html: string): string {
  let leading = true;
  return html.replace(SPAN, (whole, attrs: string, content: string) => {
    if (!leading) return whole;
    const rest = content.replace(/^(?:[ \t]|&nbsp;)+/, "");
    if (rest === "") return "";
    leading = false;
    return `<span${attrs}>${rest}</span>`;
  });
}

function createShikiCore(): Promise<HighlighterCore> {
  return createHighlighterCore({
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
    engine: createOnigurumaEngine(import("@shikijs/engine-oniguruma/wasm-inlined")),
  });
}

export class Highlighter {
  private core: Promise<HighlighterCore> | null = null;
  private readonly highlighted: LRUCache<string, string[]>;
  private readonly createCore: () => Promise<HighlighterCore>;

  constructor(private readonly deps: HighlighterDeps) {
    this.highlighted = new LRUCache({ max: deps.max ?? CACHE_ENTRIES });
    this.createCore = deps.createCore ?? createShikiCore;
  }

  async lines(code: string, file: string): Promise<string[]> {
    const lang = langOf(file);
    if (!lang || code.length > MAX_BYTES) return code.split("\n").map(escapeHtml);
    const themes = await this.deps.themes();
    const key = createHash("sha1").update(themes.key).update("\0").update(lang).update("\0").update(code).digest("hex");
    const cached = this.highlighted.get(key);
    if (cached) return cached;
    const lines = await this.tokenize(code, lang, themes);
    this.highlighted.set(key, lines);
    return lines;
  }

  async diffs(range: DiffRange, files: FileDiff[]): Promise<Map<string, FileText>> {
    const readable = files.filter((file) => !file.binary && file.hunks.some((hunk) => hunk.lines.length > 0));
    const endSpec = (file: FileDiff) => `${range.head}:${file.file}`;
    const oldSpec = (file: FileDiff) => `${range.base}:${file.oldFile ?? file.file}`;
    const needsOld = (file: FileDiff) => file.hunks.some((hunk) => hunk.lines.some((line) => line.kind === "del"));
    const blobs = await this.deps.readBlobs(range.worktreePath, [
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
              : await this.readWorkingFile(path.join(range.worktreePath, file.file));
        const oldCode = needsOld(file) ? (blobs.get(oldSpec(file)) ?? null) : null;
        const endHtml = endCode !== null ? await this.lines(endCode, file.file) : null;
        const oldHtml = oldCode !== null ? await this.lines(oldCode, file.file) : null;
        if (endCode !== null && endHtml) endTexts.set(file.file, { lines: endCode.split("\n"), html: endHtml });
        for (const line of file.hunks.flatMap((hunk) => hunk.lines)) {
          const html = line.newNo !== null ? endHtml?.[line.newNo - 1] : line.oldNo !== null ? oldHtml?.[line.oldNo - 1] : undefined;
          if (html !== undefined) line.html = html;
        }
      }),
    );
    return endTexts;
  }

  async lookup(root: string, lookup: SymbolLookup): Promise<void> {
    const fileHtml = new Map<string, Promise<string[] | null>>();
    const linesOf = (file: string) => {
      const existing = fileHtml.get(file);
      if (existing) return existing;
      const pending = this.readWorkingFile(path.join(root, file))
        .then((code) => (code === null ? null : this.lines(code, file)))
        .catch((error: unknown) => {
          this.deps.warn("highlight", error, { file });
          return null;
        });
      fileHtml.set(file, pending);
      return pending;
    };

    const fill = async (location: SymbolLocation) => {
      const { startLine, lines } = location.snippet;
      const html = location.external
        ? await this.lines(lines.join("\n"), location.file)
        : (await linesOf(location.file))?.slice(startLine - 1, startLine - 1 + lines.length);
      if (!html || html.length !== lines.length) return;
      location.snippet.html = html;
      const own = html[location.line - startLine];
      if (own !== undefined) location.html = trimIndent(own);
    };

    await Promise.all([
      ...[...lookup.definitions, ...lookup.references].map(fill),
      lookup.signature
        ? this.lines(lookup.signature, "signature.ts").then((html) => {
            lookup.signatureHtml = html.join("\n");
          })
        : null,
    ]);
  }

  private shiki(): Promise<HighlighterCore> {
    this.core ??= this.createCore();
    return this.core;
  }

  private readWorkingFile(file: string): Promise<string | null> {
    return readFile(file, "utf8").catch((error: unknown) => {
      if (!isMissing(error)) this.deps.warn("highlight", error, { file });
      return null;
    });
  }

  private async tokenize(code: string, lang: Lang, themes: EditorThemes): Promise<string[]> {
    const core = await this.shiki();
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
}
