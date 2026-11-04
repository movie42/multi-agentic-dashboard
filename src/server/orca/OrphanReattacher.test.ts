import { describe, expect, it, vi } from "vitest";
import type { OrcaTerminalRaw } from "./schema";
import { OrphanReattacher } from "./OrphanReattacher";
import { dueOrphans, isAgentOrphan, staleAttempts } from "./orphans";

function terminal(handle: string, overrides: Partial<OrcaTerminalRaw> = {}): OrcaTerminalRaw {
  return {
    handle,
    tabId: "t",
    leafId: "l",
    worktreeId: "w",
    title: null,
    connected: true,
    orphaned: true,
    agentIdentity: "claude",
    ...overrides,
  };
}

describe("orphan helpers", () => {
  it("only treats connected orphaned agent terminals as orphans", () => {
    expect(isAgentOrphan(terminal("a"))).toBe(true);
    expect(isAgentOrphan(terminal("a", { connected: false }))).toBe(false);
    expect(isAgentOrphan(terminal("a", { agentIdentity: null }))).toBe(false);
  });

  it("picks orphans not attempted within the retry window and finds vanished handles", () => {
    const attempted = new Map([
      ["a", 100],
      ["gone", 0],
    ]);
    expect(dueOrphans([terminal("a"), terminal("b")], attempted, 150, 60)).toEqual(["b"]);
    expect(dueOrphans([terminal("a")], attempted, 160, 60)).toEqual(["a"]);
    expect(staleAttempts(attempted, [terminal("a")])).toEqual(["gone"]);
  });
});

describe("OrphanReattacher", () => {
  function setup(mode: "app" | "headless" | "off" = "app") {
    const run = vi.fn(async (args: string[]) => {
      if (args.includes("bad")) throw new Error("switch failed");
      return null;
    });
    const warn = vi.fn();
    const clock = { now: 1_000 };
    const reattacher = new OrphanReattacher({
      cli: { run },
      runtime: { read: async () => ({ mode, pid: 1 }) },
      warn,
      now: () => clock.now,
      retryMs: 100,
    });
    return { run, warn, clock, reattacher };
  }

  it("switches to each due orphan once per retry window and warns on failures", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { run, warn, clock, reattacher } = setup();
    await reattacher.reattach([terminal("a"), terminal("bad")]);
    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ["terminal", "switch", "--terminal", "a"],
      ["terminal", "switch", "--terminal", "bad"],
    ]);
    expect(warn).toHaveBeenCalledOnce();
    await reattacher.reattach([terminal("a")]);
    expect(run).toHaveBeenCalledTimes(2);
    clock.now += 100;
    await reattacher.reattach([terminal("a")]);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("shares one pass while it is in flight", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { run, reattacher } = setup();
    const first = reattacher.reattach([terminal("a")]);
    const second = reattacher.reattach([terminal("a")]);
    expect(second).toBe(first);
    await first;
    expect(run).toHaveBeenCalledOnce();
  });

  it("does nothing unless the app runtime is up", async () => {
    const { run, reattacher } = setup("headless");
    await reattacher.reattach([terminal("a")]);
    expect(run).not.toHaveBeenCalled();
  });
});
