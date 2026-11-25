import "server-only";
import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { DirEntry, FileContent, FileStat } from "@/common/files/types";
import { isMissingPath } from "@/server/shared/ports";

export const MAX_TEXT_BYTES = 400 * 1024;
const SNIFF_BYTES = 8 * 1024;
const SEARCH_CAP = 200_000;
const SEARCH_TTL_MS = 10_000;
const HEAVY_DIRS: ReadonlySet<string> = new Set(["node_modules", ".git"]);

export const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
};

export type FileError = { ok: false; status: 403 | 404 | 400 };

interface FileBrowserOptions {
  worktreePaths: (options?: { fresh?: boolean }) => Promise<string[]>;
  highlight: (code: string, file: string) => Promise<string[]>;
  now?: () => number;
}

interface SearchEntry {
  at: number;
  files: string[];
  truncated: boolean;
}

function compareEntries(a: DirEntry, b: DirEntry): number {
  const aDir = a.kind === "dir" ? 0 : 1;
  const bDir = b.kind === "dir" ? 0 : 1;
  if (aDir !== bDir) return aDir - bDir;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

async function looksBinary(file: string): Promise<boolean> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

export class FileBrowser {
  private readonly searches = new Map<string, SearchEntry>();

  constructor(private readonly options: FileBrowserOptions) {}

  async list(requested: string): Promise<{ ok: true; path: string; mtimeMs: number; entries: DirEntry[] } | FileError> {
    const resolved = await this.resolve(requested);
    if (!resolved.ok) return resolved;
    const dir = path.resolve("/", requested);
    const info = await stat(resolved.file);
    if (!info.isDirectory()) return { ok: false, status: 400 };
    const dirents = await readdir(resolved.file, { withFileTypes: true });
    const entries = dirents
      .map<DirEntry>((dirent) => ({
        name: dirent.name,
        path: path.join(dir, dirent.name),
        kind: dirent.isDirectory() ? "dir" : dirent.isSymbolicLink() ? "symlink" : "file",
      }))
      .sort(compareEntries);
    return { ok: true, path: dir, mtimeMs: info.mtimeMs, entries };
  }

  async stat(requested: string): Promise<{ ok: true; stat: FileStat } | FileError> {
    const resolved = await this.resolve(requested);
    if (!resolved.ok) return resolved;
    const info = await stat(resolved.file);
    return { ok: true, stat: { path: path.resolve("/", requested), mtimeMs: info.mtimeMs } };
  }

  async read(
    requested: string,
  ): Promise<{ ok: true; path: string; size: number; mtimeMs: number; content: FileContent } | FileError> {
    const resolved = await this.resolve(requested);
    if (!resolved.ok) return resolved;
    const file = path.resolve("/", requested);
    const info = await stat(resolved.file);
    if (!info.isFile()) return { ok: false, status: 400 };
    const base = { ok: true as const, path: file, size: info.size, mtimeMs: info.mtimeMs };
    const extension = path.extname(file).toLowerCase();
    if (IMAGE_TYPES[extension]) return { ...base, content: { kind: "image" } };
    if (info.size > MAX_TEXT_BYTES) return { ...base, content: { kind: "too-large", maxBytes: MAX_TEXT_BYTES } };
    if (await looksBinary(resolved.file)) return { ...base, content: { kind: "binary" } };
    const code = await readFile(resolved.file, "utf8");
    const lines = await this.options.highlight(code, file);
    if (extension === ".md" || extension === ".markdown") return { ...base, content: { kind: "markdown", source: code, lines } };
    return { ...base, content: { kind: "text", lines, language: extension ? extension.slice(1) : null } };
  }

  async raw(requested: string): Promise<{ ok: true; body: Uint8Array<ArrayBuffer>; contentType: string } | FileError> {
    const contentType = IMAGE_TYPES[path.extname(requested).toLowerCase()];
    if (!contentType) return { ok: false, status: 400 };
    const resolved = await this.resolve(requested);
    if (!resolved.ok) return resolved;
    return { ok: true, body: new Uint8Array(await readFile(resolved.file)), contentType };
  }

  async search(
    requestedRoot: string,
    all: boolean,
  ): Promise<{ ok: true; root: string; files: string[]; truncated: boolean } | FileError> {
    const root = path.resolve("/", requestedRoot);
    const roots = await this.options.worktreePaths();
    const known = roots.includes(root) || (await this.options.worktreePaths({ fresh: true })).includes(root);
    if (!known) return { ok: false, status: 403 };
    const now = this.options.now?.() ?? Date.now();
    const key = `${root}\0${all ? "all" : "light"}`;
    const cached = this.searches.get(key);
    if (cached && now - cached.at < SEARCH_TTL_MS) return { ok: true, root, files: cached.files, truncated: cached.truncated };
    const walked = await this.walk(root, all);
    this.searches.set(key, { at: now, ...walked });
    return { ok: true, root, ...walked };
  }

  private async walk(root: string, all: boolean): Promise<{ files: string[]; truncated: boolean }> {
    const files: string[] = [];
    const pending = [""];
    while (pending.length > 0) {
      const relative = pending.pop() ?? "";
      const dirents = await readdir(path.join(root, relative), { withFileTypes: true }).catch((error: unknown) => {
        if (isMissingPath(error) || (error instanceof Error && "code" in error && error.code === "EACCES")) return [];
        throw error;
      });
      for (const dirent of dirents) {
        const child = relative ? `${relative}/${dirent.name}` : dirent.name;
        if (dirent.isDirectory()) {
          if (!all && HEAVY_DIRS.has(dirent.name)) continue;
          pending.push(child);
        } else {
          files.push(child);
          if (files.length >= SEARCH_CAP) return { files, truncated: true };
        }
      }
    }
    return { files: files.sort(), truncated: false };
  }

  // Any local file opens: the proxy already refuses requests from other origins.
  private async resolve(requested: string): Promise<{ ok: true; file: string } | FileError> {
    try {
      return { ok: true, file: await realpath(path.resolve("/", requested)) };
    } catch (error) {
      if (isMissingPath(error)) return { ok: false, status: 404 };
      throw error;
    }
  }
}
