import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postSessionMessage, requestDock, useSessionDockStore } from "@/client/entities/agent";
import { agentCard } from "../../../../../test/fixtures";
import { useSessionDock } from "./useSessionDock";

afterEach(() => {
  useSessionDockStore.setState({ pending: null });
});

const agents = [agentCard({ id: "s1", repo: "shop" })];

describe("useSessionDock", () => {
  it("takes a session a session window sends to the main window", async () => {
    vi.spyOn(window, "focus").mockImplementation(() => {});
    renderHook(() => useSessionDock({ main: true, agents, selectRepo: vi.fn() }));
    postSessionMessage({ type: "dock", agentId: "s1", from: "w-other" });
    await waitFor(() => expect(useSessionDockStore.getState().pending).toBe("s1"));
    expect(window.focus).toHaveBeenCalled();
  });

  it("leaves the request to the main window when this one is a project window of its own", async () => {
    renderHook(() => useSessionDock({ main: false, agents, selectRepo: vi.fn() }));
    postSessionMessage({ type: "dock", agentId: "s1", from: "w-other" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(useSessionDockStore.getState().pending).toBeNull();
  });

  it("moves to the session's project when no canvas on screen took the request", () => {
    const selectRepo = vi.fn();
    const { rerender } = renderHook(() => useSessionDock({ main: true, agents, selectRepo }));
    requestDock("s1");
    rerender();
    expect(selectRepo).toHaveBeenCalledWith("shop");
  });

  it("drops a request for a session no longer on the board", () => {
    const { rerender } = renderHook(() => useSessionDock({ main: true, agents, selectRepo: vi.fn() }));
    requestDock("gone");
    rerender();
    expect(useSessionDockStore.getState().pending).toBeNull();
  });

  it("gives up on a request the session's project canvas never took", () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(() => useSessionDock({ main: true, agents, selectRepo: vi.fn() }));
    requestDock("s1");
    rerender();
    vi.advanceTimersByTime(3_000);
    expect(useSessionDockStore.getState().pending).toBeNull();
    vi.useRealTimers();
  });
});
