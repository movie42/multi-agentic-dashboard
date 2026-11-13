import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { execError, fakeExecFile } from "@/server/shared/fakes";
import { listWorktrees, parseWorktreeList } from "./gitWorktrees";
import { metaOf, OrcaImport, projectsOf } from "./importFromOrca";
import { ProjectRegistry, uniqueName } from "./ProjectRegistry";
import { WorktreeMeta } from "./WorktreeMeta";

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "agent-control-projects-"));
}

describe("ProjectRegistry", () => {
  it("is not initialized until something has been written", async () => {
    const dir = await tempDir();
    const registry = new ProjectRegistry(path.join(dir, "data", "projects.json"), vi.fn());
    expect(await registry.isInitialized()).toBe(false);
    expect(await registry.list()).toEqual([]);
    await registry.replaceAll([]);
    expect(await registry.isInitialized()).toBe(true);
  });

  it("adds a folder with its kind, once, under a name no other project has", async () => {
    const dir = await tempDir();
    await mkdir(path.join(dir, "a", "app", ".git"), { recursive: true });
    await mkdir(path.join(dir, "b", "app"), { recursive: true });
    const registry = new ProjectRegistry(path.join(dir, "projects.json"), vi.fn());
    expect(await registry.add(path.join(dir, "a", "app"))).toEqual({ path: path.join(dir, "a", "app"), name: "app", kind: "git" });
    expect(await registry.add(path.join(dir, "b", "app"))).toMatchObject({ name: "app-2", kind: "folder" });
    await registry.add(path.join(dir, "a", "app/"));
    expect((await registry.list()).map((project) => project.name)).toEqual(["app", "app-2"]);
  });

  it("refuses a path that is missing or not a folder", async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, "file.txt"), "");
    const registry = new ProjectRegistry(path.join(dir, "projects.json"), vi.fn());
    await expect(registry.add(path.join(dir, "nope"))).rejects.toThrow("폴더가 없어요");
    await expect(registry.add(path.join(dir, "file.txt"))).rejects.toThrow("폴더가 아니에요");
  });

  it("moves an unreadable file aside and starts empty", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "projects.json");
    await writeFile(file, "{broken");
    const warn = vi.fn();
    expect(await new ProjectRegistry(file, warn).list()).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("numbers a taken name", () => {
    expect(uniqueName("app", new Set(["app", "app-2"]))).toBe("app-3");
  });
});

describe("WorktreeMeta", () => {
  it("merges patches per worktree, drops emptied fields, and forgets a removed worktree", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "worktrees.json");
    const meta = new WorktreeMeta(file, vi.fn());
    await meta.patch("/w", { displayName: "Mine", parentPath: "/root" });
    await meta.patch("/w", { reference: "COMP-1" });
    await meta.patch("/other", { displayName: "Other" });
    expect((await meta.read()).get("/w")).toEqual({ displayName: "Mine", parentPath: "/root", reference: "COMP-1" });
    await meta.patch("/w", { displayName: "" });
    expect((await meta.read()).get("/w")).toEqual({ parentPath: "/root", reference: "COMP-1" });
    await meta.remove("/w");
    expect([...(await meta.read()).keys()]).toEqual(["/other"]);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ worktrees: { "/other": { displayName: "Other" } } });
  });
});

describe("parseWorktreeList", () => {
  it("reads each worktree's path and branch, the first being the main checkout", () => {
    const stdout = [
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n",
      "worktree /repo-feat\nHEAD def\nbranch refs/heads/feat/x\n",
      "worktree /repo-detached\nHEAD 123\ndetached\n",
      "worktree /repo-gone\nHEAD 456\nbranch refs/heads/old\nprunable gitdir file points to non-existent location\n",
    ].join("\n");
    expect(parseWorktreeList(stdout)).toEqual([
      { path: "/repo", branch: "main", isMain: true },
      { path: "/repo-feat", branch: "feat/x", isMain: false },
      { path: "/repo-detached", branch: null, isMain: false },
    ]);
  });

  it("skips a bare repository entry", () => {
    expect(parseWorktreeList("worktree /repo.git\nbare\n\nworktree /wt\nHEAD a\nbranch refs/heads/main\n")).toEqual([
      { path: "/wt", branch: "main", isMain: false },
    ]);
  });
});

describe("listWorktrees", () => {
  it("treats a plain folder as a single worktree without calling git", async () => {
    const execFile = fakeExecFile(() => "");
    expect(await listWorktrees(execFile, { path: "/notes", name: "notes", kind: "folder" }, vi.fn())).toEqual([
      { path: "/notes", branch: null, isMain: true },
    ]);
    expect(execFile.calls).toEqual([]);
  });

  it("reports a git failure and lists nothing for that project", async () => {
    const warn = vi.fn();
    const execFile = fakeExecFile(() => execError("not a git repository", { code: 128 }));
    expect(await listWorktrees(execFile, { path: "/repo", name: "repo", kind: "git" }, warn)).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("OrcaImport", () => {
  const repos = { ok: true, result: { repos: [{ path: "/p/app", displayName: "app", kind: "git" }, { path: "/p/notes", displayName: "", kind: "folder" }] } };
  const worktrees = {
    ok: true,
    result: {
      worktrees: [
        { id: "r::/p/app", path: "/p/app", displayName: "main", displayNameMode: "automatic", parentWorktreeId: null },
        { id: "r::/p/app-x", path: "/p/app-x", displayName: "My name", displayNameMode: "fixed", parentWorktreeId: "r::/p/app" },
      ],
    },
  };

  function setup(initialized: boolean, handler: Parameters<typeof fakeExecFile>[0]) {
    const projects = { isInitialized: vi.fn(async () => initialized), replaceAll: vi.fn(async () => {}) };
    const meta = { patchAll: vi.fn(async () => {}) };
    const warn = vi.fn();
    const execFile = fakeExecFile(handler);
    const clock = { now: 0 };
    return { projects, meta, warn, execFile, clock, importer: new OrcaImport({ bin: "orca", execFile, projects, meta, warn, now: () => clock.now }) };
  }

  it("copies Orca's projects, typed worktree names and parents the first time only", async () => {
    const { importer, projects, meta, execFile } = setup(false, ({ args }) => JSON.stringify(args[0] === "repo" ? repos : worktrees));
    await importer.once();
    await importer.once();
    expect(execFile.calls.map((call) => call.args.join(" "))).toEqual(["repo list --json", "worktree list --json"]);
    expect(projects.replaceAll).toHaveBeenCalledWith([
      { path: "/p/app", name: "app", kind: "git" },
      { path: "/p/notes", name: "notes", kind: "folder" },
    ]);
    expect(meta.patchAll).toHaveBeenCalledWith(new Map([["/p/app-x", { displayName: "My name", parentPath: "/p/app" }]]));
  });

  it("does nothing once this app has its own project list", async () => {
    const { importer, execFile } = setup(true, () => "");
    await importer.once();
    expect(execFile.calls).toEqual([]);
  });

  it("starts with an empty list when Orca is not installed", async () => {
    const { importer, projects, warn } = setup(false, () => execError("spawn orca ENOENT", { code: "ENOENT" }));
    await importer.once();
    expect(projects.replaceAll).toHaveBeenCalledWith([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("leaves the list unwritten when Orca fails, so a later start can try again", async () => {
    const { importer, projects, warn } = setup(false, () => JSON.stringify({ ok: false, error: "runtime down" }));
    await importer.once();
    expect(projects.replaceAll).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("tries again a minute after Orca failed, not on every board load", async () => {
    const { importer, execFile, clock } = setup(false, () => JSON.stringify({ ok: false, error: "runtime down" }));
    await importer.once();
    clock.now = 30_000;
    await importer.once();
    expect(execFile.calls).toHaveLength(1);
    clock.now = 61_000;
    await importer.once();
    expect(execFile.calls).toHaveLength(2);
  });

  it("maps Orca's shapes", () => {
    expect(projectsOf(repos.result.repos)).toHaveLength(2);
    expect(metaOf(worktrees.result.worktrees).size).toBe(1);
  });
});
