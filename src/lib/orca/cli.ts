import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { z } from "zod";
import { orcaEnvelopeSchema } from "@/server/orca/schema";

const execFileAsync = promisify(execFile);

export const ORCA_BIN =
  process.env.ORCA_BIN ?? "/Applications/Orca.app/Contents/Resources/bin/orca";

function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return JSON.stringify(error);
}

function stdoutOf(error: unknown): string {
  return typeof error === "object" && error !== null && "stdout" in error ? String(error.stdout) : "";
}

export class OrcaCliError extends Error {}

export async function runOrca(args: string[], timeoutMs?: number): Promise<unknown>;
export async function runOrca<T extends z.ZodType>(args: string[], schema: T, timeoutMs?: number): Promise<z.infer<T>>;
export async function runOrca(args: string[], schemaOrTimeout?: z.ZodType | number, maybeTimeout?: number): Promise<unknown> {
  const schema = typeof schemaOrTimeout === "object" ? schemaOrTimeout : null;
  const timeoutMs = (typeof schemaOrTimeout === "number" ? schemaOrTimeout : maybeTimeout) ?? 15_000;
  const stdout = await execFileAsync(ORCA_BIN, [...args, "--json"], {
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  }).then(
    (output) => output.stdout,
    (error: unknown) => {
      const partial = stdoutOf(error);
      if (!partial) throw new OrcaCliError(`orca ${args.join(" ")} failed: ${describeError(error)}`);
      return partial;
    },
  );

  const json: unknown = (() => {
    try {
      return JSON.parse(stdout);
    } catch {
      throw new OrcaCliError(`orca ${args.join(" ")} returned non-JSON output`);
    }
  })();
  const envelope = orcaEnvelopeSchema.safeParse(json);
  if (!envelope.success) throw new OrcaCliError(`orca ${args.join(" ")} returned an unexpected shape`);
  if (!envelope.data.ok) throw new OrcaCliError(`orca ${args.join(" ")}: ${describeError(envelope.data.error)}`);
  if (!schema) return envelope.data.result;
  const result = schema.safeParse(envelope.data.result);
  if (!result.success) {
    throw new OrcaCliError(`orca ${args.join(" ")} result does not match the expected shape: ${result.error.message}`);
  }
  return result.data;
}
