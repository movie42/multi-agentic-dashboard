import path from "node:path";
import type { Artifact, ArtifactKind } from "@/common/orca/types";

const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const BARE_URL = /https?:\/\/[^\s)<>"'`\]]+/g;
const BARE_PATH = /(?<![\w(/])(\/[^\s)<>"'`\]]+\.(?:html?|md|pdf|png|jpe?g|svg))/g;
const FILE_EXTENSION = /\.(html?|md|pdf|png|jpe?g|svg)$/i;

const CLAUDE_ARTIFACT = /^https:\/\/claude\.ai\/(code\/)?artifact\//;
const GITHUB_PR = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/;

function kindOf(target: string): ArtifactKind | null {
  if (CLAUDE_ARTIFACT.test(target)) return "artifact";
  if (GITHUB_PR.test(target)) return "pr";
  if (/^https?:\/\//.test(target)) return null;
  if (/\.html?$/i.test(target)) return "html";
  if (/\.md$/i.test(target)) return "markdown";
  return "file";
}

function normalizeTarget(raw: string, worktreePath: string): string | null {
  const target = raw.replace(/[.,;:]+$/, "");
  if (/^https?:\/\//.test(target)) return target;
  if (target.startsWith("file://")) return decodeURI(target.slice("file://".length));
  const withoutHash = target.split("#")[0] ?? target;
  if (!FILE_EXTENSION.test(withoutHash)) return null;
  if (path.isAbsolute(withoutHash)) return withoutHash;
  if (/^[a-z]+:/i.test(withoutHash)) return null;
  return path.resolve(worktreePath, withoutHash);
}

export function extractArtifacts(message: string | null, worktreePath: string): Artifact[] {
  if (!message) return [];
  const found = new Map<string, Artifact>();

  const add = (raw: string, label: string) => {
    const target = normalizeTarget(raw, worktreePath);
    if (!target || found.has(target)) return;
    const kind = kindOf(target);
    if (!kind) return;
    const prNumber = target.match(GITHUB_PR)?.[1];
    found.set(target, { target, label: prNumber ? `#${prNumber}` : label, kind });
  };

  for (const [, label = "", target = ""] of message.matchAll(MARKDOWN_LINK)) {
    add(target, label);
  }
  const withoutLinks = message.replace(MARKDOWN_LINK, " ");
  for (const match of withoutLinks.matchAll(BARE_URL)) {
    add(match[0], "claude.ai artifact");
  }
  for (const [, target = ""] of withoutLinks.matchAll(BARE_PATH)) {
    add(target, path.basename(target));
  }

  return [...found.values()];
}
