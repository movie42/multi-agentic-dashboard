import { afterEach, describe, expect, it, vi } from "vitest";
import { requestDock, useSessionDockStore } from "./sessionDockStore";
import { CHANNEL_NAME, thisWindowId } from "./sessionWindowChannel";

afterEach(() => useSessionDockStore.setState({ pending: null }));

describe("requestDock", () => {
  it("tells the other windows to let the session go only once a canvas opened it", async () => {
    const other = new BroadcastChannel(CHANNEL_NAME);
    const seen = vi.fn();
    other.onmessage = (event: MessageEvent<unknown>) => seen(event.data);
    requestDock("s1");
    expect(useSessionDockStore.getState().pending).toBe("s1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).not.toHaveBeenCalled();
    useSessionDockStore.getState().docked("s1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    other.close();
    expect(seen).toHaveBeenCalledWith({ type: "taken", agentId: "s1", by: thisWindowId() });
    expect(useSessionDockStore.getState().pending).toBeNull();
  });

  it("leaves the session where it was when no canvas took it", async () => {
    const other = new BroadcastChannel(CHANNEL_NAME);
    const seen = vi.fn();
    other.onmessage = (event: MessageEvent<unknown>) => seen(event.data);
    requestDock("s1");
    useSessionDockStore.getState().settle("s1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    other.close();
    expect(seen).not.toHaveBeenCalled();
    expect(useSessionDockStore.getState().pending).toBeNull();
  });

  it("does not drop a newer request when an older one settles", () => {
    requestDock("s1");
    requestDock("s2");
    useSessionDockStore.getState().settle("s1");
    expect(useSessionDockStore.getState().pending).toBe("s2");
  });
});
