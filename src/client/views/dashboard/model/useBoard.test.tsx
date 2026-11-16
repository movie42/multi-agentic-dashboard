import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardSnapshot } from "@/common/board/types";
import { BOARD_POLL_MS } from "@/client/entities/board";
import { useBoard } from "./useBoard";

const runner = vi.hoisted(() => ({ connection: { state: "connecting" } as { state: "connecting" } | { state: "online"; sessions: never[] } }));
vi.mock("@/client/entities/runner", () => ({ useRunnerSessions: () => runner.connection }));

const snapshot = (fetchedAt: number): BoardSnapshot => ({ fetchedAt, projects: [], worktrees: [], agents: [], features: [] });

function respond(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body)));
}

function wrapper() {
  const client = new QueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  runner.connection = { state: "connecting" };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useBoard", () => {
  it("renders the server snapshot first, then replaces it with the fetched board", async () => {
    const fetchMock = vi.fn(() => respond({ ok: true, board: snapshot(2) }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useBoard(snapshot(1)), { wrapper: wrapper() });
    expect(result.current.data?.fetchedAt).toBe(1);
    await waitFor(() => expect(result.current.data?.fetchedAt).toBe(2));
    expect(fetchMock).toHaveBeenCalledWith("/api/board", expect.objectContaining({ cache: "no-store" }));
  });

  it("keeps the last board and exposes the error when a poll fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond({ ok: false, error: "보드 응답 없음" })));
    const { result } = renderHook(() => useBoard(snapshot(1)), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error?.message).toBe("보드 응답 없음"));
    expect(result.current.data?.fetchedAt).toBe(1);
  });

  it("refetches as soon as the session runner reports a change, without waiting for the next poll", async () => {
    const fetchMock = vi.fn(() => respond({ ok: true, board: snapshot(2) }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = renderHook(() => useBoard(snapshot(1)), { wrapper: wrapper() });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    runner.connection = { state: "online", sessions: [] };
    rerender();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("polls every three seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn(() => respond({ ok: true, board: snapshot(Date.now()) }));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useBoard(), { wrapper: wrapper() });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(BOARD_POLL_MS));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(BOARD_POLL_MS).toBe(3000);
  });
});
