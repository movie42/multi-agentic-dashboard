import "server-only";
import type { RunnerSession } from "@/common/runner/types";
import type { TokenLedger } from "./TokenLedger";
import { sessionTokens } from "./transcriptTokens";

export interface RecordClosesDeps {
  ledger: TokenLedger;
  projectsDir: string;
}

/** Adds the tokens of the Claude sessions just closed to the ledger. */
export async function recordCloses({ ledger, projectsDir }: RecordClosesDeps, closed: readonly RunnerSession[]): Promise<void> {
  for (const session of closed) {
    if (session.kind !== "claude") continue;
    const ids = session.conversationId && session.conversationId !== session.id ? [session.id, session.conversationId] : [session.id];
    await ledger.record(await sessionTokens(projectsDir, session.cwd, ids));
  }
}

export interface TokenService {
  read: () => ReturnType<TokenLedger["read"]>;
  recordCloses: (closed: readonly RunnerSession[]) => Promise<void>;
}

export function createTokenService(deps: RecordClosesDeps): TokenService {
  return { read: () => deps.ledger.read(), recordCloses: (closed) => recordCloses(deps, closed) };
}
