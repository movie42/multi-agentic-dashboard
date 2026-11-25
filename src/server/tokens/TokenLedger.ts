import "server-only";
import { z } from "zod";
import { addTokens, ZERO_TOKENS, type TokenCounts, type TokenTally } from "@/common/tokens/types";
import type { Report } from "@/server/shared/fallback";
import { JsonFile } from "@/server/shared/JsonFile";

const countsSchema = z.object({ input: z.number(), output: z.number(), cacheWrite: z.number(), cacheRead: z.number() });

const ledgerSchema = z.object({
  /** What was already counted per Claude Code session id, so a session closed twice adds only what grew. */
  sessions: z.record(z.string(), countsSchema),
  total: countsSchema,
});

type LedgerFile = z.infer<typeof ledgerSchema>;

function grown(now: TokenCounts, before: TokenCounts): TokenCounts {
  return {
    input: Math.max(0, now.input - before.input),
    output: Math.max(0, now.output - before.output),
    cacheWrite: Math.max(0, now.cacheWrite - before.cacheWrite),
    cacheRead: Math.max(0, now.cacheRead - before.cacheRead),
  };
}

function larger(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    input: Math.max(a.input, b.input),
    output: Math.max(a.output, b.output),
    cacheWrite: Math.max(a.cacheWrite, b.cacheWrite),
    cacheRead: Math.max(a.cacheRead, b.cacheRead),
  };
}

/** Running total of the tokens spent by the sessions closed from the dashboard. */
export class TokenLedger {
  private readonly file: JsonFile<LedgerFile>;

  constructor(file: string, warn: Report) {
    this.file = new JsonFile({ file, schema: ledgerSchema, empty: () => ({ sessions: {}, total: ZERO_TOKENS }), warn, scope: "token-ledger" });
  }

  async read(): Promise<TokenTally> {
    const { total } = await this.file.read();
    return { total };
  }

  /** Adds what each Claude Code session spent since it was last counted. */
  async record(counts: Record<string, TokenCounts>): Promise<void> {
    const ids = Object.keys(counts);
    await this.file.update((current) => {
      const delta = ids.reduce((sum, id) => addTokens(sum, grown(counts[id] ?? ZERO_TOKENS, current.sessions[id] ?? ZERO_TOKENS)), ZERO_TOKENS);
      const sessions = { ...current.sessions };
      for (const id of ids) sessions[id] = larger(sessions[id] ?? ZERO_TOKENS, counts[id] ?? ZERO_TOKENS);
      return { sessions, total: addTokens(current.total, delta) };
    });
  }
}
