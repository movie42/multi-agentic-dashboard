import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { UsageReader } from "./UsageReader";

const NOW = Date.parse("2026-11-13T12:00:00.000Z");
const MISSING = path.join(tmpdir(), "no-such-dir-usage", "usage.json");

async function fileWith(content: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "usage-reader-"));
  const file = path.join(dir, "usage.json");
  await writeFile(file, content);
  return file;
}

function savedAt(receivedAt: number, resetsAt = "2026-11-13T15:00:00.000Z") {
  return { session: { percent: 12, resetsAt }, weekly: null, receivedAt };
}

const FETCHED = { session: { percent: 40, resetsAt: null }, weekly: { percent: 9, resetsAt: null }, receivedAt: NOW };

function apiReturning(result: () => Promise<typeof FETCHED>) {
  return { read: vi.fn(result) };
}

describe("UsageReader", () => {
  it("serves recent status-line numbers without calling the API", async () => {
    const saved = savedAt(NOW - 60_000);
    const api = apiReturning(() => Promise.resolve(FETCHED));
    const reader = new UsageReader(await fileWith(JSON.stringify(saved)), api, () => NOW);
    expect(await reader.read()).toEqual({ ...saved, source: "statusline" });
    expect(api.read).not.toHaveBeenCalled();
  });

  it("falls back to the API when no session has reported yet", async () => {
    const reader = new UsageReader(MISSING, apiReturning(() => Promise.resolve(FETCHED)), () => NOW);
    expect(await reader.read()).toEqual({ ...FETCHED, source: "api" });
  });

  it("falls back to the API once the saved numbers are ten minutes old", async () => {
    const api = apiReturning(() => Promise.resolve(FETCHED));
    const reader = new UsageReader(await fileWith(JSON.stringify(savedAt(NOW - 600_000))), api, () => NOW);
    expect(await reader.read()).toMatchObject({ source: "api" });
  });

  it("falls back to the API when a saved window has already reset", async () => {
    const saved = savedAt(NOW - 60_000, "2026-11-13T11:59:00.000Z");
    const reader = new UsageReader(await fileWith(JSON.stringify(saved)), apiReturning(() => Promise.resolve(FETCHED)), () => NOW);
    expect(await reader.read()).toMatchObject({ source: "api" });
  });

  it("keeps showing old saved numbers when the API fails", async () => {
    const saved = savedAt(NOW - 3_600_000);
    const api = apiReturning(() => Promise.reject(new Error("사용량 조회 실패 (HTTP 429)")));
    const reader = new UsageReader(await fileWith(JSON.stringify(saved)), api, () => NOW);
    expect(await reader.read()).toEqual({ ...saved, source: "statusline" });
  });

  it("reports the API failure when there is nothing saved", async () => {
    const api = apiReturning(() => Promise.reject(new Error("사용량 조회 실패 (HTTP 429)")));
    const reader = new UsageReader(MISSING, api, () => NOW);
    await expect(reader.read()).rejects.toThrow("HTTP 429");
  });

  it("fails on a file it cannot read", async () => {
    const reader = new UsageReader(await fileWith(JSON.stringify({ nope: true })), apiReturning(() => Promise.resolve(FETCHED)));
    await expect(reader.read()).rejects.toThrow("사용량 파일을 읽지 못했어요");
  });
});
