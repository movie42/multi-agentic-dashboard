import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ORCA_BIN =
  process.env.ORCA_BIN ?? "/Applications/Orca.app/Contents/Resources/bin/orca";

interface OrcaEnvelope {
  ok: boolean;
  result?: unknown;
  error?: unknown;
}

function isEnvelope(value: unknown): value is OrcaEnvelope {
  return typeof value === "object" && value !== null && "ok" in value;
}

function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return JSON.stringify(error);
}

export class OrcaCliError extends Error {}

export async function runOrca<T>(args: string[], timeoutMs = 15_000): Promise<T> {
  let stdout: string;
  try {
    const output = await execFileAsync(ORCA_BIN, [...args, "--json"], {
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
    stdout = output.stdout;
  } catch (error) {
    const stdoutOnFailure =
      typeof error === "object" && error !== null && "stdout" in error
        ? String((error as { stdout: unknown }).stdout)
        : "";
    if (!stdoutOnFailure) {
      throw new OrcaCliError(`orca ${args.join(" ")} failed: ${describeError(error)}`);
    }
    stdout = stdoutOnFailure;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new OrcaCliError(`orca ${args.join(" ")} returned non-JSON output`);
  }
  if (!isEnvelope(parsed)) {
    throw new OrcaCliError(`orca ${args.join(" ")} returned an unexpected shape`);
  }
  if (!parsed.ok) {
    throw new OrcaCliError(`orca ${args.join(" ")}: ${describeError(parsed.error)}`);
  }
  return parsed.result as T;
}
