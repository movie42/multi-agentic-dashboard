import { execFile } from "node:child_process";

const START = "__RUNNER_ENV_START__";
const END = "__RUNNER_ENV_END__";
const TIMEOUT_MS = 10_000;

export function parseShellEnv(stdout: string): Record<string, string> | null {
  const start = stdout.indexOf(START);
  const end = stdout.indexOf(END, start);
  if (start < 0 || end < 0) return null;
  return Object.fromEntries(
    stdout
      .slice(start + START.length, end)
      .split("\0")
      .filter((entry) => entry.includes("="))
      .map((entry): [string, string] => [entry.slice(0, entry.indexOf("=")), entry.slice(entry.indexOf("=") + 1)]),
  );
}

export function readShellEnv(shell: string): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    execFile(
      shell,
      ["-ilc", `printf '%s' '${START}'; env -0; printf '%s' '${END}'`],
      { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        const parsed = parseShellEnv(stdout ?? "");
        if (!parsed) console.warn("[runner] could not read the login shell environment", error?.message ?? "no markers in output");
        resolve(parsed);
      },
    );
  });
}
