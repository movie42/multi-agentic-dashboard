const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);
const STATEFUL_GET_PATHS: ReadonlySet<string> = new Set(["/api/board"]);
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(["127.0.0.1", "localhost"]);

interface HeaderReader {
  get(name: string): string | null;
}

interface HostParts {
  hostname: string;
  port: string;
}

function parseHost(host: string): HostParts | null {
  try {
    const url = new URL(`http://${host}`);
    return { hostname: url.hostname, port: url.port };
  } catch {
    return null;
  }
}

function parseOrigin(origin: string): HostParts | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { hostname: url.hostname, port: url.port };
  } catch {
    return null;
  }
}

export function needsOriginCheck(method: string, pathname: string): boolean {
  if (!isApiPath(pathname)) return false;
  if (!SAFE_METHODS.has(method.toUpperCase())) return true;
  return STATEFUL_GET_PATHS.has(pathname.replace(/\/+$/, ""));
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isAllowedRequest(method: string, pathname: string, headers: HeaderReader): boolean {
  if (!isApiPath(pathname)) return true;

  const host = parseHost(headers.get("host") ?? "");
  if (!host || !LOCAL_HOSTNAMES.has(host.hostname)) return false;

  if (!needsOriginCheck(method, pathname)) return true;

  if (headers.get("sec-fetch-site") === "cross-site") return false;

  const originHeader = headers.get("origin");
  if (originHeader === null) return true;
  const origin = parseOrigin(originHeader);
  if (!origin || !LOCAL_HOSTNAMES.has(origin.hostname)) return false;
  return origin.port === host.port;
}
