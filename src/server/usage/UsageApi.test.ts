import { describe, expect, it, vi } from "vitest";
import { UsageApi } from "./UsageApi";

const CREDENTIALS = JSON.stringify({ claudeAiOauth: { accessToken: "token-1" } });
const BODY = {
  five_hour: { utilization: 7.4, resets_at: "2026-11-11T10:10:00+00:00" },
  seven_day: { utilization: 15, resets_at: "2026-11-17T03:00:00+00:00" },
};

function setup(responses: Array<() => Response>) {
  const now = { value: 1_000 };
  const queue = [...responses];
  const fetch = vi.fn((_url: string, _init: RequestInit) => Promise.resolve((queue.shift() ?? responses.at(-1)!)()));
  const execFile = vi.fn((_file: string, args: string[]) =>
    Promise.resolve({
      stdout: args.includes("-a") ? CREDENTIALS : JSON.stringify({ claudeAiOauth: { accessToken: "stale-token" } }),
      stderr: "",
    }),
  );
  const api = new UsageApi({
    execFile,
    readCredentialsFile: () => Promise.reject(new Error("unused")),
    keychainAccount: "someone",
    fetch,
    now: () => now.value,
  });
  return { api, fetch, execFile, now };
}

describe("UsageApi", () => {
  it("maps the windows using the keychain item saved under the current user", async () => {
    const { api, fetch, execFile } = setup([() => Response.json(BODY)]);
    await expect(api.read()).resolves.toEqual({
      session: { percent: 7, resetsAt: "2026-11-11T10:10:00+00:00" },
      weekly: { percent: 15, resetsAt: "2026-11-17T03:00:00+00:00" },
      receivedAt: 1_000,
    });
    expect(execFile.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(["-a", "someone"]));
    expect(fetch.mock.calls[0]?.[1].headers).toMatchObject({ Authorization: "Bearer token-1" });
  });

  it("serves a success for ten minutes", async () => {
    const { api, fetch, now } = setup([() => Response.json(BODY)]);
    await api.read();
    now.value += 599_000;
    await api.read();
    expect(fetch).toHaveBeenCalledTimes(1);
    now.value += 2_000;
    await api.read();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("waits five minutes after a failure, then twice as long after the next", async () => {
    const { api, fetch, now } = setup([() => new Response(null, { status: 429 })]);
    await expect(api.read()).rejects.toThrow("HTTP 429");
    now.value += 299_000;
    await expect(api.read()).rejects.toThrow("1분 뒤 다시 시도해요");
    expect(fetch).toHaveBeenCalledTimes(1);
    now.value += 1_000;
    await expect(api.read()).rejects.toThrow("HTTP 429");
    expect(fetch).toHaveBeenCalledTimes(2);
    now.value += 599_000;
    await api.read().catch(() => undefined);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("honours a longer Retry-After", async () => {
    const { api, fetch, now } = setup([
      () => new Response(null, { status: 429, headers: { "retry-after": "1800" } }),
      () => Response.json(BODY),
    ]);
    await expect(api.read()).rejects.toThrow("HTTP 429");
    now.value += 1_799_000;
    await expect(api.read()).rejects.toThrow("다시 시도해요");
    now.value += 1_000;
    await expect(api.read()).resolves.toMatchObject({ session: { percent: 7 } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("explains an expired token", async () => {
    const { api } = setup([() => new Response(null, { status: 401 })]);
    await expect(api.read()).rejects.toThrow("토큰이 만료");
  });
});
