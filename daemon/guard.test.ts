import { describe, expect, it } from "vitest";
import { callerOf, DEFAULT_ALLOWED_ORIGINS } from "./guard.ts";

const port = 3198;
const check = (host: string | undefined, origin: string | undefined) =>
  callerOf({ host, origin }, port, DEFAULT_ALLOWED_ORIGINS);

describe("callerOf", () => {
  it("accepts the dashboard's own origin on the daemon's local address", () => {
    expect(check("127.0.0.1:3198", "http://127.0.0.1:3100")).toBe("browser");
  });

  it("rejects any other site's page", () => {
    expect(check("127.0.0.1:3198", "https://evil.example")).toBe("rejected");
  });

  it("rejects a request addressed to another host name, so DNS rebinding cannot reach it", () => {
    expect(check("evil.example:3198", "http://127.0.0.1:3100")).toBe("rejected");
  });

  it("treats a request with no origin as a local process, since a browser always sends one across origins", () => {
    expect(check("127.0.0.1:3198", undefined)).toBe("local");
  });

  it("rejects a local process that reached the daemon through another host name", () => {
    expect(check("evil.example:3198", undefined)).toBe("rejected");
  });
});
