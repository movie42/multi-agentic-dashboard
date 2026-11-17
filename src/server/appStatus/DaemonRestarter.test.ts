import { describe, expect, it, vi } from "vitest";
import { fakeExecFile } from "@/server/shared/fakes";
import { DaemonRestarter } from "./DaemonRestarter";
import { buildInfoOf, daemonInfoOf, readBranchStatus, readDaemonSide } from "./readAppStatus";

function setup(working: number[]) {
  const counts = [...working];
  const ticks: Array<() => void> = [];
  const stop = vi.fn(async () => {});
  const start = vi.fn(async () => {});
  const cleared = vi.fn();
  const restarter = new DaemonRestarter({
    workingCount: async () => counts.shift() ?? 0,
    stop,
    start,
    now: () => 42,
    every: (work) => {
      ticks.push(work);
      return cleared;
    },
  });
  const tick = async () => {
    ticks.at(-1)?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { restarter, stop, start, cleared, tick };
}

describe("DaemonRestarter", () => {
  it("restarts at once when asked now, even with sessions working", async () => {
    const { restarter, stop, start } = setup([3]);
    expect(await restarter.request("now")).toEqual({ kind: "idle" });
    expect(stop).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
  });

  it("restarts at once when asked to wait but nothing is working", async () => {
    const { restarter, stop } = setup([0]);
    await restarter.request("idle");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("waits until the working sessions finish, then restarts", async () => {
    const { restarter, stop, cleared, tick } = setup([2, 1, 0]);
    expect(await restarter.request("idle")).toEqual({ kind: "scheduled", requestedAt: 42 });
    await tick();
    expect(stop).not.toHaveBeenCalled();
    await tick();
    expect(stop).toHaveBeenCalledOnce();
    expect(cleared).toHaveBeenCalled();
    expect(restarter.state()).toEqual({ kind: "idle" });
  });

  it("drops a waiting restart when cancelled", async () => {
    const { restarter, stop, cleared, tick } = setup([2, 0]);
    await restarter.request("idle");
    expect(restarter.cancel()).toEqual({ kind: "idle" });
    expect(cleared).toHaveBeenCalled();
    await tick();
    expect(stop).not.toHaveBeenCalled();
  });

  it("reports a failed restart", async () => {
    const restarter = new DaemonRestarter({
      workingCount: async () => 0,
      stop: async () => {
        throw new Error("port busy");
      },
      start: async () => {},
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await restarter.request("now")).toEqual({ kind: "failed", message: "port busy" });
  });
});

describe("readBranchStatus", () => {
  it("reads the branch, its commit and how far it is behind main", async () => {
    const exec = fakeExecFile(({ args }) => {
      const joined = args.join(" ");
      if (joined === "symbolic-ref --short -q HEAD") return "feat/x\n";
      if (joined === "rev-parse HEAD") return "bbb\n";
      if (joined === "rev-parse --verify -q refs/heads/main") return "aaa\n";
      if (joined === "rev-list --count HEAD..aaa") return "3\n";
      return new Error(`unexpected ${joined}`);
    });
    expect(await readBranchStatus("/w", exec)).toEqual({ path: "/w", branch: "feat/x", commit: "bbb", mainCommit: "aaa", behind: 3 });
  });

  it("falls back to master and leaves behind empty without either", async () => {
    const exec = fakeExecFile(({ args }) => {
      const joined = args.join(" ");
      if (joined === "symbolic-ref --short -q HEAD") return new Error("detached");
      if (joined === "rev-parse HEAD") return "bbb\n";
      return new Error("no ref");
    });
    expect(await readBranchStatus("/w", exec)).toEqual({ path: "/w", branch: null, commit: "bbb", mainCommit: null, behind: null });
  });
});

describe("app and daemon info", () => {
  it("reads the build info written by the desktop build", () => {
    expect(buildInfoOf({ commit: "aaa", branch: "main", builtAt: 1 })).toEqual({ commit: "aaa", branch: "main", builtAt: 1 });
    expect(buildInfoOf({ commit: 1 })).toBeNull();
  });

  it("reads the daemon's info and treats an older daemon as running with an unknown commit", async () => {
    expect(daemonInfoOf({ ok: true, info: { commit: "aaa", pid: 9, startedAt: 5 } })).toEqual({ commit: "aaa", pid: 9, startedAt: 5 });
    const old = vi.fn(async () => new Response("", { status: 404 }));
    expect(await readDaemonSide("http://x", old)).toEqual({ kind: "running", commit: null, startedAt: null });
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await readDaemonSide("http://x", down)).toEqual({ kind: "down" });
  });
});
