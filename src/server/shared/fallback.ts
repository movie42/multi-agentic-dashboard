export type Report = (scope: string, error: unknown, context?: Record<string, unknown>) => void;

export function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

export function missingOr<T>(fallback: T, report: Report, scope: string, context: Record<string, unknown> = {}) {
  return (error: unknown): T => {
    if (!isMissing(error)) report(scope, error, context);
    return fallback;
  };
}

export function reportAnd<T>(fallback: T, report: Report, scope: string, context: Record<string, unknown> = {}) {
  return (error: unknown): T => {
    report(scope, error, context);
    return fallback;
  };
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
