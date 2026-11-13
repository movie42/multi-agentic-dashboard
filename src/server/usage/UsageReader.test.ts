import { describe, expect, it, vi } from "vitest";
import { UsageReader } from "./UsageReader";

const CREDENTIALS = JSON.stringify({ claudeAiOauth: { accessToken: "token-1" } });
const BODY = {
  five_hour: { utilization: 7.4, resets_at: "2026-11-11T10:10:00+00:00" },
  seven_day: { utilization: 15, resets_at: "2026-11-17T03:00:00+00:00" },
  extra_usage: { is_enabled: false },
};

function setup(response: () => Response, now = { value: 1_000 }) {
  const fetch = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(response()));
  const reader = new UsageReader({
    execFile: () => Promise.resolve({ stdout: `${CREDENTIALS}\n`, stderr: "" }),
    readCredentialsFile: () => Promise.reject(new Error("unused")),
    fetch,
    now: () => now.value,
  });
  return { reader, fetch, now };
}

describe("UsageReader", () => {
  it("maps the five-hour and seven-day windows", async () => {
    const { reader, fetch } = setup(() => Response.json(BODY));
    await expect(reader.read()).resolves.toEqual({
      session: { percent: 7, resetsAt: "2026-11-11T10:10:00+00:00" },
      weekly: { percent: 15, resetsAt: "2026-11-17T03:00:00+00:00" },
      fetchedAt: 1_000,
    });
    expect(fetch.mock.calls[0]?.[1].headers).toMatchObject({ Authorization: "Bearer token-1" });
  });

  it("serves the cache for five minutes, then refetches", async () => {
    const { reader, fetch, now } = setup(() => Response.json(BODY));
    await reader.read();
    now.value += 299_000;
    await reader.read();
    expect(fetch).toHaveBeenCalledTimes(1);
    now.value += 2_000;
    await reader.read();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refetches on a fresh read once the cache is 30 seconds old", async () => {
    const { reader, fetch, now } = setup(() => Response.json(BODY));
    await reader.read();
    now.value += 29_000;
    await reader.read({ fresh: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    now.value += 2_000;
    await reader.read({ fresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("explains an expired token", async () => {
    const { reader } = setup(() => new Response(null, { status: 401 }));
    await expect(reader.read()).rejects.toThrow("토큰이 만료");
  });

  it("returns null for a window the plan does not have", async () => {
    const { reader } = setup(() => Response.json({ five_hour: null, seven_day: BODY.seven_day }));
    await expect(reader.read()).resolves.toMatchObject({ session: null, weekly: { percent: 15 } });
  });
});
