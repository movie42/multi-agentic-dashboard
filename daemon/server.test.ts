import { afterEach, describe, expect, it } from "vitest";
import { createRunnerServer, type RunnerServer } from "./server.ts";
import { SessionRegistry, type PtyProcess } from "./session/SessionRegistry.ts";

let PORT = 39_870;
let BASE = "";

function setup() {
  PORT += 1;
  BASE = `http://127.0.0.1:${PORT}`;
  const written: string[] = [];
  let emit: (data: string) => void = () => {};
  const pty: PtyProcess = {
    onData: (listener) => {
      emit = listener;
    },
    onExit: () => {},
    write: (data) => {
      written.push(data);
    },
    resize: () => {},
    kill: () => {},
  };
  const registry = new SessionRegistry({
    spawn: () => pty,
    commandFor: () => ({ file: "claude", args: [] }),
    env: {},
    newId: () => "s1",
  });
  registry.launch({ cwd: "/repo" });
  const runner = createRunnerServer({ registry, port: PORT, allowedOrigins: [] });
  return { runner, registry, written, emit: (data: string) => emit(data) };
}

let current: RunnerServer | null = null;

async function listen(runner: RunnerServer): Promise<void> {
  current = runner;
  await new Promise<void>((resolve) => runner.server.listen(PORT, "127.0.0.1", resolve));
}

afterEach(async () => {
  current?.server.closeAllConnections();
  await new Promise((resolve) => current?.server.close(resolve) ?? resolve(null));
  current = null;
});

describe("runner server", () => {
  it("returns the visible rows of a session's screen", async () => {
    const { runner, emit } = setup();
    await listen(runner);
    emit("hello\r\n❯ world");
    const body = await (await fetch(`${BASE}/sessions/s1/screen`)).json();
    expect(body.ok).toBe(true);
    expect(body.lines.slice(0, 2)).toEqual(["hello", "❯ world"]);
    expect((await fetch(`${BASE}/sessions/none/screen`)).status).toBe(404);
  });

  it("sends raw keys as they are and wraps multi-line text as a paste", async () => {
    const { runner, written } = setup();
    await listen(runner);
    const post = (body: unknown) =>
      fetch(`${BASE}/sessions/s1/input`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await post({ text: "a\nb", raw: true });
    await post({ text: "a\nb" });
    expect(written).toEqual(["a\nb", "\x1b[200~a\nb\x1b[201~"]);
  });
  it("answers a permission hook at once while no dashboard is watching", async () => {
    const { runner } = setup();
    await listen(runner);
    const response = await fetch(`${BASE}/hooks/s1/PermissionRequest`, {
      method: "POST",
      body: JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }),
    });
    expect(await response.json()).toEqual({});
  });

  it("takes the status line report for a session", async () => {
    const { runner, registry } = setup();
    await listen(runner);
    await fetch(`${BASE}/statusline/s1`, {
      method: "POST",
      body: JSON.stringify({ model: { display_name: "Opus 5.5" }, context_window: { used_percentage: 12 } }),
    });
    expect(registry.get("s1")).toMatchObject({ model: "Opus 5.5", contextPercent: 12 });
  });

  it("refuses an answer to a request that is not held", async () => {
    const { runner } = setup();
    await listen(runner);
    const response = await fetch(`${BASE}/sessions/s1/permission`, {
      method: "POST",
      body: JSON.stringify({ requestId: "x", answer: { behavior: "allow", suggestionIndex: null } }),
    });
    expect(response.status).toBe(409);
  });
});
