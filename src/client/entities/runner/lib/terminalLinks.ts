export interface TerminalLinkMatch {
  /** Code-unit offsets into the line text, end exclusive. */
  start: number;
  end: number;
  text: string;
  kind: "url" | "path";
}

const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>`\u3000-\uffff]+/g;
// A path needs a slash and a dotted last segment (`src/a.ts`, `./run.sh:12`), or must start at the root.
const PATH_PATTERN = /(?:\.{1,2}\/|\/)?(?:[\w@+-][\w.@+-]*\/)+[\w@+-][\w.@+-]*(?::\d+(?::\d+)?)?/g;
const TRAILING = /[.,;:!?'"]+$/;

function trimUrl(raw: string): string {
  const trimmed = raw.replace(TRAILING, "");
  // `(see https://x.y/z)` — drop a closing paren the URL never opened.
  const opens = (trimmed.match(/\(/g) ?? []).length;
  const closes = (trimmed.match(/\)/g) ?? []).length;
  return closes > opens && trimmed.endsWith(")") ? trimmed.slice(0, -1) : trimmed;
}

function looksLikePath(text: string): boolean {
  const bare = text.replace(/(?::\d+){1,2}$/, "");
  const last = bare.split("/").pop() ?? "";
  return bare.startsWith("/") || bare.startsWith("./") || bare.startsWith("../") || /\.[A-Za-z0-9]+$/.test(last);
}

export function findTerminalLinks(line: string): TerminalLinkMatch[] {
  const urls = [...line.matchAll(URL_PATTERN)].map((match): TerminalLinkMatch => {
    const text = trimUrl(match[0]);
    return { start: match.index, end: match.index + text.length, text, kind: "url" };
  });
  const insideUrl = (index: number) => urls.some((url) => index >= url.start && index < url.end);
  const paths = [...line.matchAll(PATH_PATTERN)].flatMap((match): TerminalLinkMatch[] => {
    const text = match[0].replace(/[.:]+$/, "");
    const before = line[match.index - 1];
    // Part of a longer token (`a//b`, `foo:bar/baz`) or of a URL already matched.
    if (insideUrl(match.index) || (before !== undefined && /[\w:/.~-]/.test(before)) || !looksLikePath(text)) return [];
    return [{ start: match.index, end: match.index + text.length, text, kind: "path" }];
  });
  return [...urls, ...paths].sort((a, b) => a.start - b.start);
}

function normalize(absolute: string): string {
  const parts = absolute.split("/").reduce<string[]>((kept, part) => {
    if (part === "" || part === ".") return kept;
    if (part === "..") return kept.slice(0, -1);
    return [...kept, part];
  }, []);
  return `/${parts.join("/")}`;
}

/** The file a path link points at, without its `:line:col` suffix, resolved against the session folder. */
export function resolveTerminalPath(text: string, cwd: string | null): string | null {
  const bare = text.replace(/(?::\d+){1,2}$/, "");
  if (bare.startsWith("/")) return normalize(bare);
  if (!cwd) return null;
  return normalize(`${cwd}/${bare}`);
}

/** An OSC 8 hyperlink target: a `file://` URI becomes a path, a web URL stays as is, anything else is dropped. */
export function targetOfUri(uri: string): string | null {
  if (/^https?:\/\//.test(uri)) return uri;
  if (!uri.startsWith("file://")) return null;
  try {
    return decodeURIComponent(new URL(uri).pathname);
  } catch {
    return null;
  }
}
