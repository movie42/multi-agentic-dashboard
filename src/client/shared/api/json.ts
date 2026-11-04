export async function readJson<T>(response: Response): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- body comes from this app's own route, whose type lives in src/common
  return (await response.json()) as T;
}

export function parseJsonLine<T>(line: string): T {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- NDJSON line from this app's own route, whose type lives in src/common
  return JSON.parse(line) as T;
}

export function errorField(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  return typeof body.error === "string" ? body.error : null;
}
