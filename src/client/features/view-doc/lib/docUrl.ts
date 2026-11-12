const DOC_ROUTE = "/api/doc";

/** A page under some `docs/` folder — what the in-app panel can show. */
export function isViewableDoc(target: string): boolean {
  return target.startsWith("/") && /\.html?$/i.test(target) && target.split("/").includes("docs");
}

export function docUrl(target: string): string {
  return DOC_ROUTE + target.split("/").map(encodeURIComponent).join("/");
}

/** Inverse of `docUrl`, for reading back which page an iframe has navigated to. */
export function targetOfDocUrl(pathname: string): string | null {
  if (!pathname.startsWith(DOC_ROUTE + "/")) return null;
  return pathname.slice(DOC_ROUTE.length).split("/").map(decodeURIComponent).join("/");
}

export function docWindowUrl(target: string): string {
  return `/doc?path=${encodeURIComponent(target)}`;
}

/** `docs/gift/APP-1/03-tasks.html` → `APP-1 · 03-tasks`; an index page drops its file name. */
export function docLabel(target: string): string {
  const parts = target.split("/");
  const below = parts.slice(parts.lastIndexOf("docs") + 1);
  const file = (below.pop() ?? "").replace(/\.html?$/i, "");
  const folder = below.at(-1);
  if (!folder) return file;
  return file === "index" ? folder : `${folder} · ${file}`;
}

/**
 * A flow task page lives at `<worktree>/docs/<domain>/<task>/<page>.html`; anything else is not a
 * task page and has no answers to hand over.
 */
export function flowTaskOf(target: string): { worktreePath: string; task: string } | null {
  const parts = target.split("/");
  const docs = parts.lastIndexOf("docs");
  if (docs <= 0 || parts.length - docs !== 4) return null;
  return { worktreePath: parts.slice(0, docs).join("/"), task: `${parts[docs + 1]}/${parts[docs + 2]}` };
}
