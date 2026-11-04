import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIntentDiff } from "./useIntentDiff";

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
  vi.unstubAllGlobals();
});

describe("useIntentDiff", () => {
  it("loads the diff for the worktree and range", async () => {
    const fetchMock = vi.fn(() => respond({ ok: true, result: { marker: "first" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useIntentDiff({ worktreePath: "/w/a", base: "abc" }), { wrapper: wrapper() });
    expect(result.current.state).toEqual({ status: "loading", result: null });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.state.result).toEqual({ marker: "first" });
    expect(fetchMock).toHaveBeenCalledWith("/api/intent-diff?path=%2Fw%2Fa&base=abc", expect.objectContaining({ cache: "no-store" }));
  });

  it("keeps the previous result while reloading and when the reload fails", async () => {
    const reloaded = Promise.withResolvers<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => respond({ ok: true, result: { marker: "first" } }))
      .mockImplementationOnce(() => reloaded.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useIntentDiff({ worktreePath: "/w/a" }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.state).toEqual({ status: "loading", result: { marker: "first" } }));
    reloaded.resolve(new Response(JSON.stringify({ ok: false, error: "git 실패" })));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state).toEqual({ status: "error", error: "git 실패", result: { marker: "first" } });
  });

  it("reports a failed first load without a result", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    const { result } = renderHook(() => useIntentDiff({ worktreePath: "/w/a" }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.state).toEqual({ status: "error", error: "network down", result: null }));
  });
});
