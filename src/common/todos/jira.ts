import type { TodoJira } from "./types";

const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

function toUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

export function parseJiraUrl(raw: string): TodoJira | null {
  const url = toUrl(raw);
  if (!url) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const fromPath = /\/browse\/([^/?#]+)/.exec(url.pathname)?.[1];
  const key = (fromPath ?? url.searchParams.get("selectedIssue") ?? "").toUpperCase();
  return ISSUE_KEY.test(key) ? { key, url: url.href } : null;
}
