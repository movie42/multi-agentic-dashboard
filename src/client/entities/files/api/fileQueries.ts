import { queryOptions } from "@tanstack/react-query";
import type { DirListResponse, FileReadResponse, FileSearchResponse, FileStatResponse } from "@/common/files/types";
import { readJson } from "@/client/shared/api/json";

/** Expanded folders and the open file are checked this often, so an agent's edits show up on their own. */
export const FILE_POLL_MS = 2000;

export const fileKeys = {
  all: ["files"] as const,
  list: (dir: string) => ["files", "list", dir] as const,
  stat: (file: string) => ["files", "stat", file] as const,
  read: (file: string, mtimeMs: number | null) => ["files", "read", file, mtimeMs] as const,
  search: (root: string, all: boolean) => ["files", "search", root, all] as const,
};

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return readJson<T>(await fetch(url, { cache: "no-store", signal }));
}

function unwrap<T extends { ok: true }>(payload: T | { ok: false; error: string }): T {
  if (!payload.ok) throw new Error(payload.error);
  return payload;
}

export function dirListQueryOptions(dir: string) {
  return queryOptions({
    queryKey: fileKeys.list(dir),
    queryFn: async ({ signal }) => unwrap(await getJson<DirListResponse>(`/api/files/list?path=${encodeURIComponent(dir)}`, signal)),
    refetchInterval: FILE_POLL_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function fileStatQueryOptions(file: string) {
  return queryOptions({
    queryKey: fileKeys.stat(file),
    queryFn: async ({ signal }) => unwrap(await getJson<FileStatResponse>(`/api/files/stat?path=${encodeURIComponent(file)}`, signal)).stat,
    refetchInterval: FILE_POLL_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Keyed by modification time: a new time is a new query, so unchanged files are never refetched. */
export function fileReadQueryOptions(file: string, mtimeMs: number | null) {
  return queryOptions({
    queryKey: fileKeys.read(file, mtimeMs),
    queryFn: async ({ signal }) => unwrap(await getJson<FileReadResponse>(`/api/files/read?path=${encodeURIComponent(file)}`, signal)),
    enabled: mtimeMs !== null,
    staleTime: Infinity,
    gcTime: 30_000,
    retry: false,
  });
}

export function fileSearchQueryOptions(root: string, all: boolean) {
  return queryOptions({
    queryKey: fileKeys.search(root, all),
    queryFn: async ({ signal }) =>
      unwrap(await getJson<FileSearchResponse>(`/api/files/search?root=${encodeURIComponent(root)}${all ? "&all=1" : ""}`, signal)),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function rawFileUrl(file: string): string {
  return `/api/files/raw?path=${encodeURIComponent(file)}`;
}
