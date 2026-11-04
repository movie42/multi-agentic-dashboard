import type { z } from "zod";
import { services } from "@/server/container";

export { OrcaCliError } from "@/server/orca/OrcaCli";
export { ORCA_BIN } from "@/server/orca/services";

export async function runOrca(args: string[], timeoutMs?: number): Promise<unknown>;
export async function runOrca<T extends z.ZodType>(args: string[], schema: T, timeoutMs?: number): Promise<z.infer<T>>;
export async function runOrca(args: string[], schemaOrTimeout?: z.ZodType | number, maybeTimeout?: number): Promise<unknown> {
  const cli = services().orca.cli;
  return typeof schemaOrTimeout === "object"
    ? cli.run(args, schemaOrTimeout, maybeTimeout)
    : cli.run(args, schemaOrTimeout);
}
