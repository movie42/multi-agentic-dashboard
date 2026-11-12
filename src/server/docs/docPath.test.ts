import { describe, expect, it } from "vitest";
import { resolveDocPath } from "./docPath";

const identity = async (target: string) => target;

describe("resolveDocPath", () => {
  const roots = ["/repo/wt-a"];

  it("serves an html page under a worktree's docs folder", async () => {
    await expect(resolveDocPath("/repo/wt-a/docs/gift/T1/index.html", roots, identity)).resolves.toEqual({
      ok: true,
      file: "/repo/wt-a/docs/gift/T1/index.html",
      contentType: "text/html; charset=utf-8",
    });
  });

  it("refuses a file outside docs", async () => {
    await expect(resolveDocPath("/repo/wt-a/src/index.html", roots, identity)).resolves.toEqual({ ok: false, reason: "outside" });
  });

  it("refuses a path that climbs out with ..", async () => {
    await expect(resolveDocPath("/repo/wt-a/docs/../.env.html", roots, identity)).resolves.toEqual({ ok: false, reason: "outside" });
  });

  it("refuses a worktree the board does not know", async () => {
    await expect(resolveDocPath("/repo/other/docs/a.html", roots, identity)).resolves.toEqual({ ok: false, reason: "outside" });
  });

  it("refuses a file type that is not a page asset", async () => {
    await expect(resolveDocPath("/repo/wt-a/docs/secret.env", roots, identity)).resolves.toEqual({ ok: false, reason: "type" });
  });

  it("judges a symlink by where it points", async () => {
    const realpath = async (target: string) => (target === "/repo/wt-a/docs/link.html" ? "/etc/passwd.html" : target);
    await expect(resolveDocPath("/repo/wt-a/docs/link.html", roots, realpath)).resolves.toEqual({ ok: false, reason: "outside" });
  });
});
