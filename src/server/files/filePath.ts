import "server-only";
import path from "node:path";

export type FilePathResult = { ok: true; file: string; root: string } | { ok: false; reason: "outside" };

function isInsideOrSame(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Any file inside a known worktree is readable, judged on the real path so a symlink cannot reach
 * outside the worktree.
 */
export async function resolveWorktreeFile(
  requested: string,
  roots: readonly string[],
  realpath: (target: string) => Promise<string>,
): Promise<FilePathResult> {
  const file = await realpath(path.resolve("/", requested));
  for (const root of roots) {
    const realRoot = await realpath(root).catch(() => root);
    if (isInsideOrSame(file, realRoot)) return { ok: true, file, root: realRoot };
  }
  return { ok: false, reason: "outside" };
}
