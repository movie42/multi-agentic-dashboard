import { beforeEach, describe, expect, it } from "vitest";
import { useFileExplorerStore } from "./fileExplorerStore";

describe("fileExplorerStore", () => {
  beforeEach(() => useFileExplorerStore.setState({ root: null, treeOpen: false, expanded: {} }));

  it("shows the tree for the worktree it was opened from and switches with it", () => {
    const { show } = useFileExplorerStore.getState();
    show("/w/a");
    expect(useFileExplorerStore.getState()).toMatchObject({ root: "/w/a", treeOpen: true });
    show("/w/b");
    expect(useFileExplorerStore.getState().root).toBe("/w/b");
  });

  it("keeps expanded folders per worktree", () => {
    const { show, toggleDir } = useFileExplorerStore.getState();
    show("/w/a");
    toggleDir("/w/a/src");
    show("/w/b");
    toggleDir("/w/b/docs");
    expect(useFileExplorerStore.getState().expanded).toEqual({ "/w/a": ["/w/a/src"], "/w/b": ["/w/b/docs"] });
    toggleDir("/w/b/docs");
    expect(useFileExplorerStore.getState().expanded["/w/b"]).toEqual([]);
  });

  it("reveals a file by expanding every folder above it", () => {
    const { show, reveal } = useFileExplorerStore.getState();
    show("/w/a");
    reveal("/w/a/src/client/x.ts");
    expect(useFileExplorerStore.getState().expanded["/w/a"]).toEqual(["/w/a/src", "/w/a/src/client"]);
  });
});
