import { RUNNER_HOOK_EVENTS, type RunnerHookEvent } from "../../src/common/runner/types.ts";

const HOOK_TIMEOUT_SECONDS = 5;
const PERMISSION_TIMEOUT_SECONDS = 600;

export interface StatusLineScript {
  node: string;
  script: string;
}

export function hookUrl(baseUrl: string, sessionId: string, event: RunnerHookEvent | "PermissionRequest"): string {
  return `${baseUrl}/hooks/${encodeURIComponent(sessionId)}/${event}`;
}

export function statusLineUrl(baseUrl: string, sessionId: string): string {
  return `${baseUrl}/statusline/${encodeURIComponent(sessionId)}`;
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** `//` marks an absolute path in a permission rule; a single `/` would be relative to the settings file. */
export function readRule(directory: string): string {
  return `Read(/${directory.replace(/\/+$/, "")}/**)`;
}

export function hookSettings(baseUrl: string, sessionId: string, statusLine?: StatusLineScript, readableDirs: readonly string[] = []): string {
  const hooks = Object.fromEntries([
    ...RUNNER_HOOK_EVENTS.map((event) => [
      event,
      [{ matcher: "*", hooks: [{ type: "http", url: hookUrl(baseUrl, sessionId, event), timeout: HOOK_TIMEOUT_SECONDS }] }],
    ]),
    [
      "PermissionRequest",
      [
        {
          matcher: "*",
          hooks: [{ type: "http", url: hookUrl(baseUrl, sessionId, "PermissionRequest"), timeout: PERMISSION_TIMEOUT_SECONDS }],
        },
      ],
    ],
  ]);
  const command = statusLine
    ? [statusLine.node, statusLine.script, statusLineUrl(baseUrl, sessionId)].map(shellQuote).join(" ")
    : null;
  return JSON.stringify({
    hooks,
    ...(command ? { statusLine: { type: "command", command, padding: 0 } } : {}),
    ...(readableDirs.length > 0 ? { permissions: { allow: readableDirs.map(readRule) } } : {}),
  });
}
