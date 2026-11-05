import { describe, expect, it } from "vitest";
import { isAllowedRequest, needsOriginCheck } from "./origin";

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

describe("origin check", () => {
  it("lets non-API paths through", () => {
    expect(isAllowedRequest("POST", "/diff", headers({ host: "evil.com" }))).toBe(true);
  });

  it("rejects API requests whose Host is not local", () => {
    expect(isAllowedRequest("GET", "/api/sessions", headers({ host: "evil.com:3199" }))).toBe(false);
    expect(isAllowedRequest("GET", "/api/sessions", headers({ host: "127.0.0.1:3199" }))).toBe(true);
    expect(isAllowedRequest("GET", "/api/sessions", headers({ host: "[::1]:3199" }))).toBe(true);
  });

  it("checks the origin of state-changing requests and the board poll", () => {
    expect(needsOriginCheck("POST", "/api/actions")).toBe(true);
    expect(needsOriginCheck("GET", "/api/board/")).toBe(true);
    expect(needsOriginCheck("GET", "/api/sessions")).toBe(false);
  });

  it("rejects cross-site and foreign-origin writes", () => {
    const host = "127.0.0.1:3199";
    expect(isAllowedRequest("POST", "/api/actions", headers({ host, "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isAllowedRequest("POST", "/api/actions", headers({ host, origin: "https://evil.com" }))).toBe(false);
    expect(isAllowedRequest("POST", "/api/actions", headers({ host, origin: "http://localhost:4000" }))).toBe(false);
    expect(isAllowedRequest("POST", "/api/actions", headers({ host, origin: "http://localhost:3199" }))).toBe(true);
    expect(isAllowedRequest("POST", "/api/actions", headers({ host }))).toBe(true);
  });
});
