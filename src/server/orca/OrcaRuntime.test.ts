import { describe, expect, it, vi } from "vitest";
import { execError, fakeExecFile, type ExecCall } from "@/server/shared/fakes";
import { OrcaCli } from "./OrcaCli";
import { OrcaRuntime, type ProcessPort } from "./OrcaRuntime";
import { appExecutableOf, modeOfCommand, serveEnv } from "./runtimeMode";

const BIN = "/Applications/Orca.app/Contents/Resources/bin/orca";
const APP = "/Applications/Orca.app/Contents/MacOS/Orca";

function status(running: boolean, pid: number | null = 10) {
  return JSON.stringify({ ok: true, result: { app: { running, pid }, runtime: { reachable: running } } });
}

interface World {
  running: boolean;
  command: string;
  alive: Set<number>;
}

function setup(world: World, handler?: (call: ExecCall) => string | Error | undefined) {
  const warn = vi.fn();
  const execFile = fakeExecFile((call) => {
    const custom = handler?.(call);
    if (custom !== undefined) return custom;
    if (call.file === BIN && call.args[0] === "status") return status(world.running);
    if (call.file === BIN && call.args[0] === "open") {
      world.running = true;
      world.command = APP;
      return '{"ok":true,"result":null}';
    }
    if (call.file === "ps") return world.command ? `${world.command}\n` : execError("exit 1", { code: 1 });
    if (call.file === "osascript") {
      world.alive.delete(10);
      return "";
    }
    return "";
  });
  const spawned: string[][] = [];
  const processes: ProcessPort = {
    kill: vi.fn((pid: number, signal: NodeJS.Signals | 0) => {
      if (signal === "SIGTERM") {
        world.alive.delete(pid);
        return;
      }
      if (!world.alive.has(pid)) throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
    }),
    spawnDetached: (_command, args) => {
      spawned.push(args);
      world.running = true;
      world.command = "/usr/local/bin/node orca serve";
    },
    env: () => ({ PORT: "3100", HOSTNAME: "x", KEEP: "1", NODE_ENV: "test" }),
  };
  const clock = { now: 0 };
  const runtime = new OrcaRuntime({
    cli: new OrcaCli(BIN, execFile),
    execFile,
    processes,
    warn,
    sleep: async () => {
      clock.now += 1;
    },
    now: () => clock.now,
    quitTimeoutMs: 10,
    readyTimeoutMs: 10,
    pollMs: 1,
  });
  return { runtime, execFile, warn, spawned, processes };
}

describe("runtime helpers", () => {
  it("derives the app executable and the mode from the process command", () => {
    expect(appExecutableOf(BIN)).toBe(APP);
    expect(modeOfCommand(APP, APP)).toBe("app");
    expect(modeOfCommand("node serve", APP)).toBe("headless");
  });

  it("drops server env vars before spawning orca serve", () => {
    expect(serveEnv({ PORT: "1", HOSTNAME: "h", ELECTRON_RUN_AS_NODE: "1", A: "b", NODE_ENV: "production" })).toEqual({
      A: "b",
      NODE_ENV: "production",
    });
  });
});

describe("OrcaRuntime.read", () => {
  it("reports app, headless and off", async () => {
    expect(await setup({ running: true, command: APP, alive: new Set() }).runtime.read()).toEqual({ mode: "app", pid: 10 });
    expect(await setup({ running: true, command: "node serve", alive: new Set() }).runtime.read()).toEqual({
      mode: "headless",
      pid: 10,
    });
    expect(await setup({ running: false, command: "", alive: new Set() }).runtime.read()).toEqual({ mode: "off", pid: 10 });
  });

  it("is off without a warning when the pid has no process", async () => {
    const { runtime, warn } = setup({ running: true, command: "", alive: new Set() });
    expect(await runtime.read()).toEqual({ mode: "off", pid: null });
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns and reports off when orca status fails", async () => {
    const { runtime, warn } = setup({ running: true, command: APP, alive: new Set() }, (call) =>
      call.args[0] === "status" ? execError("ENOENT", {}) : undefined,
    );
    expect(await runtime.read()).toEqual({ mode: "off", pid: null });
    expect(warn).toHaveBeenCalledWith("runtime", expect.any(Error), { step: "orca status" });
  });
});

describe("OrcaRuntime.switchTo", () => {
  it("quits the app and starts orca serve for headless", async () => {
    const world = { running: true, command: APP, alive: new Set([10]) };
    const { runtime, execFile, spawned } = setup(world);
    expect(await runtime.switchTo("headless")).toBe("headless");
    expect(execFile.calls.some((call) => call.file === "osascript")).toBe(true);
    expect(spawned).toEqual([["serve", "--no-pairing"]]);
  });

  it("stops orca serve and opens the app", async () => {
    const world = { running: true, command: "node serve", alive: new Set([10]) };
    const { runtime, processes } = setup(world);
    expect(await runtime.switchTo("app")).toBe("app");
    expect(processes.kill).toHaveBeenCalledWith(10, "SIGTERM");
  });

  it("does nothing when already in the target mode", async () => {
    const { runtime, spawned } = setup({ running: true, command: APP, alive: new Set() });
    expect(await runtime.switchTo("app")).toBe("app");
    expect(spawned).toEqual([]);
  });

  it("fails when the app does not quit in time", async () => {
    const world = { running: true, command: APP, alive: new Set([10]) };
    const { runtime } = setup(world, (call) => (call.file === "osascript" ? "" : undefined));
    await expect(runtime.switchTo("headless")).rejects.toThrow(/종료되지 않았어요/);
  });
});
