import { describe, expect, it } from "vitest";
import type { Conductor } from "../../src/common/orchestration/types.ts";
import { isDelegated, ruleFor } from "./grants.ts";

const bash = (command: string) => ({ toolName: "Bash", toolInput: { command }, suggestions: [] });
const conductor = (overrides: Partial<Conductor> = {}): Conductor => ({
  scope: { kind: "project", root: "/r", paths: [], projects: ["/r"] },
  grants: [],
  rules: [],
  knownProjects: [],
  worktreeRequest: null,
  projectRequest: null,
  ...overrides,
});

describe("isDelegated", () => {
  it("covers file edits with the edit bundle only", () => {
    const edit = { toolName: "Edit", toolInput: { file_path: "/r/a.ts" }, suggestions: [] };
    expect(isDelegated(conductor({ grants: ["edit"] }), edit)).toBe(true);
    expect(isDelegated(conductor({ grants: ["build"] }), edit)).toBe(false);
  });

  it("covers test and build commands with the build bundle", () => {
    const granted = conductor({ grants: ["build"] });
    expect(isDelegated(granted, bash("bun run test"))).toBe(true);
    expect(isDelegated(granted, bash("bunx tsc --noEmit"))).toBe(true);
    expect(isDelegated(granted, bash("curl https://example.com"))).toBe(false);
  });

  it("covers git commit but never git push, even through a rule", () => {
    const granted = conductor({ grants: ["commit"], rules: [{ toolName: "Bash", prefix: "git push" }] });
    expect(isDelegated(granted, bash("git commit -m 'x'"))).toBe(true);
    expect(isDelegated(granted, bash("git push origin main"))).toBe(false);
  });

  it("refuses chained commands that would smuggle another command past a prefix", () => {
    const granted = conductor({ grants: ["build", "commit"] });
    expect(isDelegated(granted, bash("bun run test && git push"))).toBe(false);
    expect(isDelegated(granted, bash("git add . ; rm -rf /"))).toBe(false);
    expect(isDelegated(granted, bash("git status $(whoami)"))).toBe(false);
  });

  it("never hands a question meant for the person to the conductor", () => {
    expect(isDelegated(conductor({ rules: [{ toolName: "AskUserQuestion", prefix: null }] }), { toolName: "AskUserQuestion", toolInput: {}, suggestions: [] })).toBe(false);
  });

  it("matches rules added from a permission card", () => {
    const granted = conductor({ rules: [{ toolName: "Bash", prefix: "make lint" }, { toolName: "WebFetch", prefix: null }] });
    expect(isDelegated(granted, bash("make lint --fix"))).toBe(true);
    expect(isDelegated(granted, bash("make deploy"))).toBe(false);
    expect(isDelegated(granted, { toolName: "WebFetch", toolInput: { url: "x" }, suggestions: [] })).toBe(true);
  });
});

describe("ruleFor", () => {
  it("keeps the first two words of a Bash command", () => {
    expect(ruleFor(bash("make lint --fix"))).toEqual({ toolName: "Bash", prefix: "make lint" });
  });

  it("covers the whole tool for other tools and nothing for unsafe commands", () => {
    expect(ruleFor({ toolName: "WebFetch", toolInput: {}, suggestions: [] })).toEqual({ toolName: "WebFetch", prefix: null });
    expect(ruleFor(bash("a && b"))).toBeNull();
  });
});
