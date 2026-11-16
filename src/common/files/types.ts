export interface DirEntry {
  name: string;
  /** Absolute path. */
  path: string;
  kind: "dir" | "file" | "symlink";
}

export type DirListResponse =
  | { ok: true; path: string; mtimeMs: number; entries: DirEntry[] }
  | { ok: false; error: string };

export type FileContent =
  | { kind: "text"; lines: string[]; language: string | null }
  | { kind: "markdown"; source: string; lines: string[] }
  | { kind: "image" }
  | { kind: "binary" }
  | { kind: "too-large"; maxBytes: number };

export type FileReadResponse =
  | { ok: true; path: string; size: number; mtimeMs: number; content: FileContent }
  | { ok: false; error: string };

export interface FileStat {
  path: string;
  mtimeMs: number;
}

export type FileStatResponse = { ok: true; stat: FileStat } | { ok: false; error: string };

export type FileSearchResponse =
  | {
      ok: true;
      root: string;
      /** Paths relative to `root`. */
      files: string[];
      /** True when the walk stopped at the file cap. */
      truncated: boolean;
    }
  | { ok: false; error: string };
