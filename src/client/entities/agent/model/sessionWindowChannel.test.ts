import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHANNEL_NAME,
  onSessionMessage,
  postSessionMessage,
  sessionWindowHolding,
  thisWindowId,
  watchTaken,
  withWindow,
  withoutWindow,
} from "./sessionWindowChannel";

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

let other: BroadcastChannel | null = null;
afterEach(() => {
  other?.close();
  other = null;
});

describe("session window registry", () => {
  it("finds the live window holding a session, never this window itself", () => {
    let registry = withWindow({}, "w1", ["a", "b"], 1_000);
    registry = withWindow(registry, "w2", ["c"], 1_000);
    expect(sessionWindowHolding(registry, "b", 2_000, "me")).toBe("w1");
    expect(sessionWindowHolding(registry, "c", 2_000, "w2")).toBeNull();
    expect(sessionWindowHolding(registry, "z", 2_000, "me")).toBeNull();
  });

  it("ignores a window silent for longer than a hidden window's held-back timers, as a crashed one would", () => {
    const registry = withWindow({}, "w1", ["a"], 1_000);
    expect(sessionWindowHolding(registry, "a", 90_000, "me")).toBe("w1");
    expect(sessionWindowHolding(registry, "a", 200_000, "me")).toBeNull();
  });

  it("forgets a window that closed", () => {
    const registry = withoutWindow(withWindow({}, "w1", ["a"], 1_000), "w1");
    expect(sessionWindowHolding(registry, "a", 1_000, "me")).toBeNull();
  });
});

describe("session window messages", () => {
  it("reaches the other windows and comes back from them", async () => {
    other = new BroadcastChannel(CHANNEL_NAME);
    const seen = vi.fn();
    other.onmessage = (event: MessageEvent<unknown>) => seen(event.data);
    postSessionMessage({ type: "dock", agentId: "a", from: thisWindowId() });
    await tick();
    expect(seen).toHaveBeenCalledWith({ type: "dock", agentId: "a", from: thisWindowId() });

    const received = vi.fn();
    const stop = onSessionMessage(received);
    other.postMessage({ type: "focus", agentId: "a" });
    other.postMessage({ type: "nonsense" });
    other.postMessage("text");
    await tick();
    stop();
    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith({ type: "focus", agentId: "a" });
  });

  it("tells a dragged tab whether another window took it, even when the news came before the drop ended", async () => {
    other = new BroadcastChannel(CHANNEL_NAME);
    const watch = watchTaken("a");
    other.postMessage({ type: "taken", agentId: "a", by: "w2" });
    await tick();
    expect(await watch.wait(50)).toBe(true);

    const nobody = watchTaken("b");
    other.postMessage({ type: "taken", agentId: "a", by: "w2" });
    expect(await nobody.wait(50)).toBe(false);
  });

  it("does not count this window taking its own tab", async () => {
    const watch = watchTaken("a");
    other = new BroadcastChannel(CHANNEL_NAME);
    other.postMessage({ type: "taken", agentId: "a", by: thisWindowId() });
    expect(await watch.wait(50)).toBe(false);
  });
});
