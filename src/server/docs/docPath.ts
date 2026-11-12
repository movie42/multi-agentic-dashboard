import "server-only";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export type DocPathResult =
  | { ok: true; file: string; contentType: string }
  | { ok: false; reason: "type" | "outside" };

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Only files under a known worktree's `docs/` folder are served, judged on the real path so a
 * symlink inside `docs/` cannot reach outside it.
 */
export async function resolveDocPath(
  requested: string,
  roots: readonly string[],
  realpath: (target: string) => Promise<string>,
): Promise<DocPathResult> {
  const contentType = CONTENT_TYPES[path.extname(requested).toLowerCase()];
  if (!contentType) return { ok: false, reason: "type" };
  const file = await realpath(path.resolve("/", requested));
  for (const root of roots) {
    const docs = path.join(await realpath(root).catch(() => root), "docs");
    if (isInside(file, docs)) return { ok: true, file, contentType };
  }
  return { ok: false, reason: "outside" };
}
