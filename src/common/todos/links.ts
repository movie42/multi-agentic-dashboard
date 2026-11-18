import { parseJiraUrl } from "./jira";
import type { TodoJira, TodoLink, TodoLinkKind } from "./types";

function toUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase();
}

function kindOf(url: URL): TodoLinkKind {
  const host = hostOf(url);
  if (host === "slack.com" || host.endsWith(".slack.com")) return "slack";
  if (host === "notion.so" || host.endsWith(".notion.so") || host.endsWith(".notion.site")) return "notion";
  if (host === "figma.com" || host.endsWith(".figma.com")) return "figma";
  if (host === "github.com" && /^\/[^/]+\/[^/]+\/pull\/\d+/.test(url.pathname)) return "github-pr";
  return "other";
}

export type ParsedLink = { type: "jira"; jira: TodoJira } | { type: "link"; link: TodoLink };

/** A pasted address: a Jira issue goes to the card's Jira chips, anything else becomes a link of its kind. */
export function parseCardLink(raw: string): ParsedLink | null {
  const jira = parseJiraUrl(raw);
  if (jira) return { type: "jira", jira };
  const url = toUrl(raw);
  if (!url) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return { type: "link", link: { kind: kindOf(url), url: url.href } };
}

export const LINK_LABEL: Record<TodoLinkKind, string> = {
  slack: "슬랙",
  notion: "노션",
  figma: "피그마",
  "github-pr": "PR",
  other: "링크",
};

/** A short name for a link chip: the Slack channel id, the PR number, the Notion page slug, or the host. */
export function linkCaption(link: TodoLink): string {
  const url = toUrl(link.url);
  if (!url) return link.url;
  if (link.kind === "github-pr") {
    const [, owner, repo, , number] = url.pathname.split("/");
    return `${repo ?? owner ?? ""} #${number ?? ""}`;
  }
  if (link.kind === "slack") {
    const channel = /\/archives\/([^/]+)/.exec(url.pathname)?.[1];
    return channel ? `#${channel}` : hostOf(url);
  }
  if (link.kind === "notion" || link.kind === "figma") {
    const last = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    const name = decodeURIComponent(last).replace(/-?[0-9a-f]{32}$/i, "").replace(/-/g, " ").trim();
    return name || hostOf(url);
  }
  return hostOf(url);
}
