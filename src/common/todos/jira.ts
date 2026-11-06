import type { TodoJira } from "./types";

const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

export function parseJiraUrl(raw: string): TodoJira | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const fromPath = /\/browse\/([^/?#]+)/.exec(url.pathname)?.[1];
  const key = (fromPath ?? url.searchParams.get("selectedIssue") ?? "").toUpperCase();
  return ISSUE_KEY.test(key) ? { key, url: url.href } : null;
}
