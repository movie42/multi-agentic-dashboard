import "server-only";
import path from "node:path";

export type RuntimeMode = "app" | "headless" | "off";

export type RuntimeResponse = { ok: true; mode: RuntimeMode } | { ok: false; error: string };

export interface RuntimeStatus {
  mode: RuntimeMode;
  pid: number | null;
}

export function appExecutableOf(bin: string): string {
  return path.resolve(path.join(path.dirname(bin), "..", "..", "MacOS", "Orca"));
}

export function modeOfCommand(command: string, appExecutable: string): Exclude<RuntimeMode, "off"> {
  return command === appExecutable ? "app" : "headless";
}

export function serveEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const dropped = new Set(["ELECTRON_RUN_AS_NODE", "PORT", "HOSTNAME"]);
  return { ...Object.fromEntries(Object.entries(env).filter(([key]) => !dropped.has(key))), NODE_ENV: env.NODE_ENV };
}
