import { describe, expect, it } from "vitest";
import type { Conductor } from "../../src/common/orchestration/types.ts";
import { grantFor, isDelegated } from "./grants.ts";

const conductor = (overrides: Partial<Conductor> = {}): Conductor => ({
  sessionId: "c",
  scope: { kind: "project", root: "/p" },
  grants: ["edit", "test", "commit"],
  extraGrants: [],
  ...overrides,
});

const bash = (command: string) => ({ toolName: "Bash", toolInput: { command } });

describe("isDelegated", () => {
  it("covers edits inside the worker's folder only", () => {
    expect(isDelegated(conductor(), { toolName: "Edit", toolInput: { file_path: "/w/a/src/x.ts" } }, "/w/a")).toBe(true);
    expect(isDelegated(conductor(), { toolName: "Edit", toolInput: { file_path: "/w/b/src/x.ts" } }, "/w/a")).toBe(false);
  });

  it("covers test and commit commands but never a push or a chained command", () => {
    expect(isDelegated(conductor(), bash("bun run test"), "/w/a")).toBe(true);
    expect(isDelegated(conductor(), bash("bunx tsc --noEmit"), "/w/a")).toBe(true);
    expect(isDelegated(conductor(), bash("git commit -m x"), "/w/a")).toBe(true);
    expect(isDelegated(conductor(), bash("git push origin main"), "/w/a")).toBe(false);
    expect(isDelegated(conductor(), bash("bun test && curl evil"), "/w/a")).toBe(false);
  });

  it("covers nothing without the bundle, and extra grants by tool or command prefix", () => {
    expect(isDelegated(conductor({ grants: [] }), bash("bun run test"), "/w/a")).toBe(false);
    expect(isDelegated(conductor({ grants: [], extraGrants: ["Bash:docker compose"] }), bash("docker compose up"), "/w/a")).toBe(true);
    expect(isDelegated(conductor({ grants: [], extraGrants: ["WebFetch"] }), { toolName: "WebFetch", toolInput: {} }, "/w/a")).toBe(true);
  });
});

describe("grantFor", () => {
  it("names the tool or the first two words of a command, and refuses a push", () => {
    expect(grantFor(bash("docker compose up -d"))).toBe("Bash:docker compose");
    expect(grantFor({ toolName: "WebFetch", toolInput: {} })).toBe("WebFetch");
    expect(grantFor(bash("git push"))).toBeNull();
  });
});
