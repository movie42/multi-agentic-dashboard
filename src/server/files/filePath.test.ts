import { describe, expect, it } from "vitest";
import { resolveWorktreeFile } from "./filePath";

const identity = async (target: string) => target;

describe("resolveWorktreeFile", () => {
  const roots = ["/repo/wt-a"];

  it("allows any file inside a worktree, ignored or hidden ones included", async () => {
    await expect(resolveWorktreeFile("/repo/wt-a/node_modules/x/index.js", roots, identity)).resolves.toEqual({
      ok: true,
      file: "/repo/wt-a/node_modules/x/index.js",
      root: "/repo/wt-a",
    });
    await expect(resolveWorktreeFile("/repo/wt-a/.env", roots, identity)).resolves.toMatchObject({ ok: true });
  });

  it("allows the worktree folder itself", async () => {
    await expect(resolveWorktreeFile("/repo/wt-a", roots, identity)).resolves.toMatchObject({ ok: true, file: "/repo/wt-a" });
  });

  it("refuses a path that climbs out with ..", async () => {
    await expect(resolveWorktreeFile("/repo/wt-a/../secret", roots, identity)).resolves.toEqual({ ok: false, reason: "outside" });
  });

  it("refuses a sibling folder sharing the worktree name as prefix", async () => {
    await expect(resolveWorktreeFile("/repo/wt-ab/a.ts", roots, identity)).resolves.toEqual({ ok: false, reason: "outside" });
  });

  it("refuses a symlink whose real path is outside", async () => {
    const realpath = async (target: string) => (target === "/repo/wt-a/link" ? "/etc/passwd" : target);
    await expect(resolveWorktreeFile("/repo/wt-a/link", roots, realpath)).resolves.toEqual({ ok: false, reason: "outside" });
  });
});
