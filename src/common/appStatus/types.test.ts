import { describe, expect, it } from "vitest";
import { mismatchOf, projectCommandsRequestSchema, shortSha, type AppStatus } from "./types";

const base: AppStatus = {
  repoPath: "/repo",
  checkout: { path: "/repo", branch: "main", commit: "aaa", mainCommit: "aaa", behind: 0 },
  app: { kind: "built", commit: "aaa", branch: "main", builtAt: 1 },
  daemon: { kind: "running", commit: "aaa", startedAt: 1 },
  workingSessions: 0,
  restart: { kind: "idle" },
};

describe("mismatchOf", () => {
  it("is quiet when the app, the daemon and main share one commit", () => {
    expect(mismatchOf(base)).toEqual({ app: false, daemon: false, any: false });
  });

  it("flags an app built from another commit", () => {
    expect(mismatchOf({ ...base, app: { kind: "built", commit: "bbb", branch: "feat/x", builtAt: 1 } })).toMatchObject({ app: true, any: true });
  });

  it("never flags a dev server, which reloads the working tree itself", () => {
    expect(mismatchOf({ ...base, app: { kind: "dev" } }).app).toBe(false);
  });

  it("flags a daemon on another commit, one that cannot say its commit, and a stopped daemon", () => {
    expect(mismatchOf({ ...base, daemon: { kind: "running", commit: "bbb", startedAt: 1 } }).daemon).toBe(true);
    expect(mismatchOf({ ...base, daemon: { kind: "running", commit: null, startedAt: null } }).daemon).toBe(true);
    expect(mismatchOf({ ...base, daemon: { kind: "down" } }).daemon).toBe(true);
  });

  it("does not compare against main when the repository has none", () => {
    const status: AppStatus = {
      ...base,
      checkout: { ...base.checkout, mainCommit: null, behind: null },
      app: { kind: "built", commit: "bbb", branch: null, builtAt: 1 },
      daemon: { kind: "running", commit: "ccc", startedAt: 1 },
    };
    expect(mismatchOf(status).any).toBe(false);
  });
});

describe("shortSha", () => {
  it("shortens a commit and names a missing one", () => {
    expect(shortSha("0123456789abcdef")).toBe("0123456");
    expect(shortSha(null)).toBe("알 수 없음");
  });
});

describe("projectCommandsRequestSchema", () => {
  const ok = (value: unknown) => projectCommandsRequestSchema.safeParse(value).success;
  it.each([
    [{ type: "propose", projectPath: "/p" }, true],
    [{ type: "propose", projectPath: "p" }, false],
    [{ type: "revise", projectPath: "/p", request: "재설치에 캐시 지우기 붙여 줘" }, true],
    [{ type: "revise", projectPath: "/p", request: "  " }, false],
    [{ type: "save", projectPath: "/p", commands: [{ name: "빌드", command: "bun run build" }] }, true],
    [{ type: "save", projectPath: "/p", commands: [{ name: "빌드", command: "a\nb" }] }, false],
    [{ type: "save", projectPath: "/p", commands: [] }, true],
  ])("%j → %s", (value, expected) => {
    expect(ok(value)).toBe(expected);
  });
});
