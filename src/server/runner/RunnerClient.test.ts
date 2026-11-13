import { describe, expect, it, vi } from "vitest";
import { RunnerClient } from "./RunnerClient";

const session = { id: "s1", cwd: "/w", kind: "claude", status: "idle", prompted: false, startedAt: 1, updatedAt: 1, exitCode: null, model: null, contextPercent: null, permission: null };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function setup(responses: Array<Response | Error>, clock = { now: 0 }) {
  const queue = [...responses];
  const fetchFn = vi.fn(async () => {
    const next = queue.shift() ?? new Error("offline");
    if (next instanceof Error) throw next;
    return next;
  });
  const start = vi.fn();
  const client = new RunnerClient({ baseUrl: "http://runner", fetch: fetchFn as unknown as typeof fetch, start, wait: async () => {}, attempts: 3, now: () => clock.now });
  return { client, fetchFn, start };
}

describe("RunnerClient", () => {
  it("lists sessions from a running daemon without starting another", async () => {
    const { client, start } = setup([json({ ok: true, sessions: [session] })]);
    expect(await client.list()).toEqual([session]);
    expect(start).not.toHaveBeenCalled();
  });

  it("starts the daemon when it is not reachable, waits for it, then retries the call", async () => {
    const { client, start, fetchFn } = setup([
      new Error("refused"),
      new Error("refused"),
      new Error("refused"),
      json({ ok: true, sessions: [] }),
      json({ ok: true, session }),
    ]);
    expect(await client.launch({ cwd: "/w", prompt: "hi" })).toEqual(session);
    expect(start).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenLastCalledWith("http://runner/sessions", expect.objectContaining({ method: "POST", body: JSON.stringify({ cwd: "/w", prompt: "hi" }) }));
  });

  it("gives up when the daemon never answers", async () => {
    const { client, start } = setup([]);
    await expect(client.list()).rejects.toThrow("띄우지 못했어요");
    expect(start).toHaveBeenCalledOnce();
  });

  it("passes on the daemon's own error message", async () => {
    const { client } = setup([json({ ok: false, error: "세션이 없어요." }, 404)]);
    await expect(client.close("gone")).rejects.toThrow("세션이 없어요.");
  });

  it("sends input to one session", async () => {
    const { client, fetchFn } = setup([json({ ok: true })]);
    await client.input("s 1", { text: "hello", submit: true });
    expect(fetchFn).toHaveBeenCalledWith("http://runner/sessions/s%201/input", expect.objectContaining({ body: JSON.stringify({ text: "hello", submit: true }) }));
  });

  it("reads a session's screen rows", async () => {
    const { client, fetchFn } = setup([json({ ok: true, lines: ["a", "b"] })]);
    expect(await client.screen("s 1")).toEqual(["a", "b"]);
    expect(fetchFn).toHaveBeenCalledWith("http://runner/sessions/s%201/screen", expect.anything());
  });

  it("does not try to start the daemon again right after a failed start, so board polls fail fast", async () => {
    const clock = { now: 0 };
    const { client, start } = setup([], clock);
    await expect(client.list()).rejects.toThrow("세션 러너 데몬을 띄우지 못했어요");
    clock.now = 5_000;
    await expect(client.list()).rejects.toThrow("세션 러너 데몬을 띄우지 못했어요");
    expect(start).toHaveBeenCalledOnce();
    clock.now = 11_000;
    await expect(client.list()).rejects.toThrow();
    expect(start).toHaveBeenCalledTimes(2);
  });
});
