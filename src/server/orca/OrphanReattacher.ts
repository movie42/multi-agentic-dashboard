import "server-only";
import type { ReportFn } from "@/server/shared/ports";
import type { OrcaCli } from "./OrcaCli";
import type { OrcaRuntime } from "./OrcaRuntime";
import { dueOrphans, staleAttempts } from "./orphans";
import type { OrcaTerminalRaw } from "./schema";

export const ORPHAN_RETRY_MS = 60_000;

export interface OrphanReattacherOptions {
  cli: Pick<OrcaCli, "run">;
  runtime: Pick<OrcaRuntime, "read">;
  warn: ReportFn;
  now?: () => number;
  retryMs?: number;
}

export class OrphanReattacher {
  private readonly attemptedAt = new Map<string, number>();
  private inFlight: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly retryMs: number;

  constructor(private readonly options: OrphanReattacherOptions) {
    this.now = options.now ?? Date.now;
    this.retryMs = options.retryMs ?? ORPHAN_RETRY_MS;
  }

  reattach(terminals: OrcaTerminalRaw[]): Promise<void> {
    staleAttempts(this.attemptedAt, terminals).forEach((handle) => this.attemptedAt.delete(handle));
    if (this.inFlight) return this.inFlight;
    const due = dueOrphans(terminals, this.attemptedAt, this.now(), this.retryMs);
    if (due.length === 0) return Promise.resolve();
    const pass = this.reattachAll(due)
      .catch((error: unknown) => this.options.warn("orphans", error, { step: "reattach pass" }))
      .finally(() => {
        this.inFlight = null;
      });
    this.inFlight = pass;
    return pass;
  }

  private async reattachAll(handles: string[]): Promise<void> {
    const runtime = await this.options.runtime.read();
    if (runtime.mode !== "app") return;
    for (const handle of handles) {
      this.attemptedAt.set(handle, this.now());
      try {
        await this.options.cli.run(["terminal", "switch", "--terminal", handle]);
        console.log("[orphans] reattached", handle);
      } catch (error) {
        this.options.warn("orphans", error, { step: "reattach", handle });
      }
    }
  }
}
