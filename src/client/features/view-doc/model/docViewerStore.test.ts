import { beforeEach, describe, expect, it } from "vitest";
import { openInPanel, useDocViewerStore } from "./docViewerStore";

const A = "/w/docs/d/A/index.html";
const B = "/w/docs/d/B/index.html";
const C = "/w/docs/d/C/index.html";

describe("docViewerStore", () => {
  beforeEach(() => useDocViewerStore.getState().closeAll());

  it("opens a document once and focuses it when opened again", () => {
    const { open } = useDocViewerStore.getState();
    open(A);
    open(B);
    open(A);
    const state = useDocViewerStore.getState();
    expect(state.tabs.map((tab) => tab.target)).toEqual([A, B]);
    expect(state.active).toBe(A);
  });

  it("follows navigation inside the tab and finds the tab by the page it shows", () => {
    const { open, navigated } = useDocViewerStore.getState();
    open(A);
    open(B);
    navigated(A, C, null);
    open(C);
    const state = useDocViewerStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[0]).toMatchObject({ target: A, current: C, title: "C" });
    expect(state.active).toBe(A);
  });

  it("moves focus to the neighbour when the active tab closes", () => {
    const { open, activate, close } = useDocViewerStore.getState();
    [A, B, C].forEach(open);
    activate(B);
    close(B);
    expect(useDocViewerStore.getState().active).toBe(C);
    close(C);
    expect(useDocViewerStore.getState().active).toBe(A);
    close(A);
    expect(useDocViewerStore.getState()).toMatchObject({ tabs: [], active: null });
  });

  it("reuses the preview tab for the next single-clicked file and keeps pinned ones", () => {
    const { openFile, pin } = useDocViewerStore.getState();
    openFile("/w/src/a.ts", { preview: true });
    openFile("/w/src/b.ts", { preview: true });
    expect(useDocViewerStore.getState().tabs.map((tab) => tab.target)).toEqual(["/w/src/b.ts"]);
    pin("/w/src/b.ts");
    openFile("/w/src/c.ts", { preview: true });
    const state = useDocViewerStore.getState();
    expect(state.tabs.map((tab) => [tab.target, tab.preview])).toEqual([
      ["/w/src/b.ts", false],
      ["/w/src/c.ts", true],
    ]);
    expect(state.tabs[1]).toMatchObject({ kind: "file", title: "c.ts" });
    expect(state.active).toBe("/w/src/c.ts");
  });

  it("pins a preview tab when the same file is opened for keeps", () => {
    const { openFile } = useDocViewerStore.getState();
    openFile("/w/src/a.ts", { preview: true });
    openFile("/w/src/a.ts", { preview: false });
    expect(useDocViewerStore.getState().tabs).toMatchObject([{ target: "/w/src/a.ts", preview: false }]);
  });

  it("opens a docs page as a page tab, another local file as a file tab, and leaves URLs alone", () => {
    expect(openInPanel(A)).toBe(true);
    expect(openInPanel("/w/notes/plan.md")).toBe(true);
    expect(openInPanel("https://claude.ai/artifact/x")).toBe(false);
    const state = useDocViewerStore.getState();
    expect(state.tabs.map((tab) => [tab.kind, tab.target, tab.preview])).toEqual([
      ["doc", A, false],
      ["file", "/w/notes/plan.md", false],
    ]);
  });
});
