import { describe, expect, it, vi } from "vitest";
import { execError, fakeExecFile, fakeFileSystem } from "@/server/shared/fakes";
import { GitInfo } from "./GitInfo";

const PR_JSON = '[{"number":7,"state":"OPEN","isDraft":false,"url":"https://github.com/a/b/pull/7"}]';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("GitInfo.getPullRequest", () => {
  it("skips shared and missing branches without running gh", () => {
    const execFile = fakeExecFile(() => PR_JSON);
    const git = new GitInfo({ execFile, fs: fakeFileSystem({}), warn: vi.fn() });
    expect(git.getPullRequest("/w", "main")).toEqual({ kind: "not-applicable" });
    expect(git.getPullRequest("/w", null)).toEqual({ kind: "not-applicable" });
    expect(execFile.calls).toHaveLength(0);
  });

  it("shows loading first, then the fetched value, once per key", async () => {
    const execFile = fakeExecFile(() => PR_JSON);
    const git = new GitInfo({ execFile, fs: fakeFileSystem({}), warn: vi.fn() });
    expect(git.getPullRequest("/w", "feat/x")).toEqual({ kind: "loading" });
    expect(git.getPullRequest("/w", "feat/x")).toEqual({ kind: "loading" });
    await flush();
    expect(git.getPullRequest("/w", "feat/x")).toMatchObject({ kind: "found", number: 7 });
    expect(execFile.calls).toHaveLength(1);
    expect(execFile.calls[0]?.options?.cwd).toBe("/w");
  });

  it("keeps showing the stale value while a refresh runs after the ttl", async () => {
    const responses = [PR_JSON, "[]"];
    const execFile = fakeExecFile(() => responses.shift() ?? "[]");
    const git = new GitInfo({ execFile, fs: fakeFileSystem({}), warn: vi.fn(), prTtlMs: 1 });
    git.getPullRequest("/w", "feat/x");
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(git.getPullRequest("/w", "feat/x")).toMatchObject({ kind: "found" });
    await flush();
    expect(git.getPullRequest("/w", "feat/x")).toEqual({ kind: "none" });
  });

  it("maps a repo without remotes to not-applicable and other failures to unknown with a warning", async () => {
    const warn = vi.fn();
    const execFile = fakeExecFile(({ args }) =>
      execError("gh failed", { stderr: args.includes("feat/a") ? "no git remotes found" : "HTTP 502" }),
    );
    const git = new GitInfo({ execFile, fs: fakeFileSystem({}), warn });
    git.getPullRequest("/w", "feat/a");
    git.getPullRequest("/w", "feat/b");
    await flush();
    expect(git.getPullRequest("/w", "feat/a")).toEqual({ kind: "not-applicable" });
    expect(git.getPullRequest("/w", "feat/b")).toEqual({ kind: "unknown" });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toBe("pr");
  });
});

describe("GitInfo.detectMode", () => {
  function setup(remote: string) {
    const files = { "/repo/.git/config": { content: "", mtimeMs: 1 } };
    const fs = fakeFileSystem(files);
    const execFile = fakeExecFile(({ file, args }) => {
      if (file === "gh") return "me\n";
      if (args.includes("--git-common-dir")) return "/repo/.git\n";
      return remote;
    });
    return { files, execFile, git: new GitInfo({ execFile, fs, warn: vi.fn() }) };
  }

  it("caches by git config mtime and recomputes when the config changes", async () => {
    const { files, execFile, git } = setup("git@github.com:acme/repo.git");
    expect(await git.detectMode("/repo")).toBe("company");
    expect(await git.detectMode("/repo")).toBe("company");
    const remoteCalls = () => execFile.calls.filter((call) => call.args.includes("get-url")).length;
    expect(remoteCalls()).toBe(1);
    files["/repo/.git/config"].mtimeMs = 2;
    await git.detectMode("/repo");
    expect(remoteCalls()).toBe(2);
    expect(execFile.calls.filter((call) => call.file === "gh")).toHaveLength(1);
  });

  it("is personal when origin is missing, without a warning", async () => {
    const warn = vi.fn();
    const execFile = fakeExecFile(({ file, args }) => {
      if (file === "gh") return "me";
      if (args.includes("--git-common-dir")) return "/repo/.git";
      return execError("no remote", { stderr: "error: No such remote 'origin'" });
    });
    const git = new GitInfo({ execFile, fs: fakeFileSystem({}), warn });
    expect(await git.detectMode("/repo")).toBe("personal");
    expect(warn).not.toHaveBeenCalled();
  });

  it("asks gh again after a failed login lookup instead of caching the wrong mode", async () => {
    const answers = [execError("offline", { stderr: "network" }), "me"];
    const execFile = fakeExecFile(({ file, args }) => {
      if (file === "gh") return answers.shift() ?? "me";
      if (args.includes("--git-common-dir")) return "/repo/.git";
      return "git@github.com:me/repo.git";
    });
    const git = new GitInfo({ execFile, fs: fakeFileSystem({ "/repo/.git/config": { content: "", mtimeMs: 1 } }), warn: vi.fn() });
    expect(await git.detectMode("/repo")).toBe("company");
    expect(await git.detectMode("/repo")).toBe("personal");
  });
});
