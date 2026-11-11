import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrcaCli } from "./OrcaCli";
import { importProject } from "./importProject";

vi.mock("server-only", () => ({}));

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "import-project-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function fakeCli() {
  const run = vi.fn(() => Promise.resolve({}));
  return { cli: { run } as unknown as OrcaCli, run };
}

describe("importProject", () => {
  it("adds a checkout with a .git directory as a git repo", async () => {
    await mkdir(path.join(root, ".git"));
    const { cli, run } = fakeCli();
    await expect(importProject(cli, root)).resolves.toBe("git");
    expect(run).toHaveBeenCalledWith(["repo", "add", "--path", root, "--kind", "git"]);
  });

  it("treats a .git file (linked worktree) as a git repo", async () => {
    await writeFile(path.join(root, ".git"), "gitdir: /elsewhere\n");
    const { cli, run } = fakeCli();
    await expect(importProject(cli, root)).resolves.toBe("git");
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(["--kind", "git"]));
  });

  it("adds a folder without .git as a plain folder", async () => {
    const { cli, run } = fakeCli();
    await expect(importProject(cli, root)).resolves.toBe("folder");
    expect(run).toHaveBeenCalledWith(["repo", "add", "--path", root, "--kind", "folder"]);
  });

  it("rejects a missing path or a file without calling orca", async () => {
    const file = path.join(root, "note.txt");
    await writeFile(file, "x");
    const { cli, run } = fakeCli();
    await expect(importProject(cli, path.join(root, "nope"))).rejects.toThrow("폴더가 없어요");
    await expect(importProject(cli, file)).rejects.toThrow("폴더가 아니에요");
    expect(run).not.toHaveBeenCalled();
  });
});
