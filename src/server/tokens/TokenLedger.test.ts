import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TokenLedger } from "./TokenLedger";

const tokens = (input: number, output = 0, cacheWrite = 0, cacheRead = 0) => ({ input, output, cacheWrite, cacheRead });

async function ledger() {
  const dir = await mkdtemp(path.join(tmpdir(), "ledger-"));
  return new TokenLedger(path.join(dir, "token-ledger.json"), () => {});
}

describe("TokenLedger", () => {
  it("starts empty", async () => {
    expect(await (await ledger()).read()).toEqual({ total: tokens(0) });
  });

  it("adds a closed session's tokens to the total", async () => {
    const store = await ledger();
    await store.record({ s1: tokens(10, 20, 30, 40) });
    expect(await store.read()).toEqual({ total: tokens(10, 20, 30, 40) });
  });

  it("adds only what grew when a session that was counted before is closed again", async () => {
    const store = await ledger();
    await store.record({ s1: tokens(10, 10) });
    await store.record({ s1: tokens(15, 10), s2: tokens(1) });
    expect((await store.read()).total).toEqual(tokens(16, 10));
  });

  it("leaves the total alone when the session spent no new tokens", async () => {
    const store = await ledger();
    await store.record({ s1: tokens(10) });
    await store.record({ s1: tokens(10) });
    expect((await store.read()).total).toEqual(tokens(10));
  });
});
