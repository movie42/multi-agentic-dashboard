import "server-only";
import type { z } from "zod";
import { errorField, type ExecFileFn } from "@/server/shared/ports";
import { orcaEnvelopeSchema } from "./schema";
import { terminalReadSchema } from "./schema";

export const DEFAULT_ORCA_BIN = "/Applications/Orca.app/Contents/Resources/bin/orca";
export const DEFAULT_ORCA_TIMEOUT_MS = 15_000;

export class OrcaCliError extends Error {}

function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return JSON.stringify(error);
}

function parseJson(args: string[], stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new OrcaCliError(`orca ${args.join(" ")} returned non-JSON output`);
  }
}

export function parseOrcaOutput(args: string[], stdout: string): unknown;
export function parseOrcaOutput<T extends z.ZodType>(args: string[], stdout: string, schema: T): z.infer<T>;
export function parseOrcaOutput(args: string[], stdout: string, schema?: z.ZodType): unknown {
  const envelope = orcaEnvelopeSchema.safeParse(parseJson(args, stdout));
  if (!envelope.success) throw new OrcaCliError(`orca ${args.join(" ")} returned an unexpected shape`);
  if (!envelope.data.ok) throw new OrcaCliError(`orca ${args.join(" ")}: ${describeError(envelope.data.error)}`);
  if (!schema) return envelope.data.result;
  const result = schema.safeParse(envelope.data.result);
  if (!result.success) {
    throw new OrcaCliError(`orca ${args.join(" ")} result does not match the expected shape: ${result.error.message}`);
  }
  return result.data;
}

export class OrcaCli {
  constructor(
    readonly bin: string,
    private readonly execFile: ExecFileFn,
  ) {}

  async readScreen(handle: string): Promise<string[]> {
    return (await this.readTerminal(handle)).lines;
  }

  async readTerminal(handle: string): Promise<{ lines: string[]; draft: string }> {
    const result = await this.run(["terminal", "read", "--terminal", handle, "--screen"], terminalReadSchema);
    return {
      lines: result.terminal.tail.map((line) => line.replace(/\s+$/, "")),
      draft: result.terminal.draft ?? "",
    };
  }

  async type(handle: string, text: string): Promise<void> {
    await this.run(["terminal", "send", "--terminal", handle, "--text", text]);
  }

  async run(args: string[], timeoutMs?: number): Promise<unknown>;
  async run<T extends z.ZodType>(args: string[], schema: T, timeoutMs?: number): Promise<z.infer<T>>;
  async run(args: string[], schemaOrTimeout?: z.ZodType | number, maybeTimeout?: number): Promise<unknown> {
    const schema = typeof schemaOrTimeout === "object" ? schemaOrTimeout : undefined;
    const timeoutMs = (typeof schemaOrTimeout === "number" ? schemaOrTimeout : maybeTimeout) ?? DEFAULT_ORCA_TIMEOUT_MS;
    const stdout = await this.execFile(this.bin, [...args, "--json"], {
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    }).then(
      (output) => output.stdout,
      (error: unknown) => {
        const partial = errorField(error, "stdout");
        if (!partial) throw new OrcaCliError(`orca ${args.join(" ")} failed: ${describeError(error)}`);
        return partial;
      },
    );
    return schema ? parseOrcaOutput(args, stdout, schema) : parseOrcaOutput(args, stdout);
  }
}
