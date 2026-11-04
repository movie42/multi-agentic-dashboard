"use client";

import { useEffect, useState } from "react";
import type { BoardResponse, BoardSnapshot } from "@/common/orca/types";

const POLL_MS = 3000;

interface BoardState {
  board: BoardSnapshot | null;
  error: string | null;
}

export function useBoard(): BoardState {
  const [state, setState] = useState<BoardState>({ board: null, error: null });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const response = await fetch("/api/board", { cache: "no-store" });
        const payload = (await response.json()) as BoardResponse;
        if (cancelled) return;
        setState((previous) =>
          payload.ok
            ? { board: payload.board, error: null }
            : { board: previous.board, error: payload.error },
        );
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setState((previous) => ({ board: previous.board, error: message }));
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return state;
}
