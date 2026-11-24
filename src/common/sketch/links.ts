export interface TextSegment {
  text: string;
  url?: string;
}

/** Web pages and the note and work apps a memo points at; any other scheme stays plain text. */
const ALLOWED: ReadonlySet<string> = new Set(["http", "https", "obsidian", "vscode", "cursor", "notion", "slack", "figma", "linear"]);
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;

/** An allowed `scheme://` address with no whitespace. */
export const isLinkUrl = (value: string) => {
  const scheme = SCHEME.exec(value)?.[1];
  return scheme !== undefined && ALLOWED.has(scheme.toLowerCase()) && !/\s/.test(value);
};

const LINK = /\[([^\]\n]+)\]\(([a-z][a-z0-9+.-]*:\/\/[^\s)]+)\)|([a-z][a-z0-9+.-]*:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/gi;

/** Plain runs, `[name](url)` links and bare link URLs, in order. */
export function textSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const plain = (run: string) => {
    const last = segments.at(-1);
    if (last && last.url === undefined) segments[segments.length - 1] = { text: last.text + run };
    else segments.push({ text: run });
  };
  const matches = [...text.matchAll(LINK)];
  const end = matches.reduce((from, match) => {
    const at = match.index;
    if (at > from) plain(text.slice(from, at));
    const [whole, name, named, bare] = match;
    const url = named ?? bare ?? "";
    if (isLinkUrl(url)) segments.push({ text: name ?? url, url });
    else plain(whole);
    return at + whole.length;
  }, 0);
  if (end < text.length) plain(text.slice(end));
  return segments;
}
