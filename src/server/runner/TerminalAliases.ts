import "server-only";
import { z } from "zod";
import type { Report } from "@/server/shared/fallback";
import { JsonFile } from "@/server/shared/JsonFile";

const aliasFileSchema = z.object({ terminals: z.record(z.string(), z.string()) });

type AliasFile = z.infer<typeof aliasFileSchema>;

/** Names a person gave shell terminals, keyed by the runner's terminal handle. */
export class TerminalAliases {
  private readonly file: JsonFile<AliasFile>;

  constructor(file: string, warn: Report) {
    this.file = new JsonFile({ file, schema: aliasFileSchema, empty: () => ({ terminals: {} }), warn, scope: "terminal-aliases" });
  }

  async read(): Promise<ReadonlyMap<string, string>> {
    return new Map(Object.entries((await this.file.read()).terminals));
  }

  async rename(terminalHandle: string, alias: string): Promise<void> {
    await this.file.update((current) => ({ terminals: { ...current.terminals, [terminalHandle]: alias } }));
  }

  async forget(terminalHandles: readonly string[]): Promise<void> {
    const gone = new Set(terminalHandles);
    await this.file.update((current) => ({
      terminals: Object.fromEntries(Object.entries(current.terminals).filter(([handle]) => !gone.has(handle))),
    }));
  }
}
