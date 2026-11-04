"use client";

import { useQuery } from "@tanstack/react-query";
import type { BoardSnapshot } from "@/common/orca/types";
import { boardQueryOptions } from "@/client/entities/board";

export function useBoard(initialBoard: BoardSnapshot | null = null) {
  return useQuery({ ...boardQueryOptions(), initialData: initialBoard ?? undefined });
}
