"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { BoardSnapshot } from "@/common/board/types";
import { boardKeys, boardQueryOptions } from "@/client/entities/board";
import { useRunnerSessions } from "@/client/entities/runner";

export function useBoard(initialBoard: BoardSnapshot | null = null) {
  const queryClient = useQueryClient();
  const runner = useRunnerSessions();
  useEffect(() => {
    if (runner.state === "online") void queryClient.invalidateQueries({ queryKey: boardKeys.all });
  }, [runner, queryClient]);
  return useQuery({ ...boardQueryOptions(), initialData: initialBoard ?? undefined });
}
