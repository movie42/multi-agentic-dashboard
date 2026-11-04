import { queryOptions } from "@tanstack/react-query";
import type { BoardResponse, BoardSnapshot } from "@/common/orca/types";
import { readJson } from "@/client/shared/api/json";

export const BOARD_POLL_MS = 3000;

export const boardKeys = {
  all: ["board"] as const,
};

export async function fetchBoard(signal?: AbortSignal): Promise<BoardSnapshot> {
  const response = await fetch("/api/board", { cache: "no-store", signal });
  const payload = await readJson<BoardResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload.board;
}

export function boardQueryOptions() {
  return queryOptions({
    queryKey: boardKeys.all,
    queryFn: ({ signal }) => fetchBoard(signal),
    refetchInterval: BOARD_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
