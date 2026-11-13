const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "http://127.0.0.1:3100",
  "http://localhost:3100",
  "http://127.0.0.1:3199",
  "http://localhost:3199",
];

export function isLocalHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  try {
    const url = new URL(`http://${host}`);
    return LOCAL_HOSTNAMES.has(url.hostname) && url.port === String(port);
  } catch {
    return false;
  }
}

export type Caller = "browser" | "local" | "rejected";

export function callerOf(
  request: { host: string | undefined; origin: string | undefined },
  port: number,
  allowedOrigins: readonly string[],
): Caller {
  if (!isLocalHost(request.host, port)) return "rejected";
  if (request.origin) return allowedOrigins.includes(request.origin) ? "browser" : "rejected";
  return "local";
}
