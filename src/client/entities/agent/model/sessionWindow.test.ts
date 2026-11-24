import { afterEach, describe, expect, it, vi } from "vitest";
import { openSessionWindow, sessionWindowHref } from "./sessionWindow";
import { CHANNEL_NAME } from "./sessionWindowChannel";

function stubWindow(registry: object) {
  const storage = new Map([["agent-control:session-windows", JSON.stringify(registry)]]);
  const open = vi.fn(() => ({}) as Window);
  vi.stubGlobal("window", {
    open,
    screen: { availWidth: 3000, availHeight: 2000 },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
  });
  return open;
}

afterEach(() => vi.unstubAllGlobals());

describe("sessionWindowHref", () => {
  it("points a session window at its sessions, one tab each", () => {
    expect(sessionWindowHref("abc 1")).toBe("/session?id=abc+1");
    expect(sessionWindowHref(["a", "b"])).toBe("/session?id=a&id=b");
  });
});

describe("openSessionWindow", () => {
  it("opens a window of its own for a session no window holds", () => {
    const open = stubWindow({});
    expect(openSessionWindow("s1")).toBe(true);
    expect(open).toHaveBeenCalledWith("/session?id=s1", expect.stringMatching(/^session-window:/), expect.any(String));
  });

  it("does not open a second window for a session whose window is still loading", () => {
    const open = stubWindow({});
    openSessionWindow("s1");
    openSessionWindow("s1");
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("brings forward the window that already holds the session as a tab", async () => {
    const open = stubWindow({ w1: { agentIds: ["s0", "s1"], seen: Date.now() } });
    const other = new BroadcastChannel(CHANNEL_NAME);
    const seen = vi.fn();
    other.onmessage = (event: MessageEvent<unknown>) => seen(event.data);
    expect(openSessionWindow("s1")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    other.close();
    expect(open).not.toHaveBeenCalled();
    expect(seen).toHaveBeenCalledWith({ type: "focus", agentId: "s1" });
  });
});
