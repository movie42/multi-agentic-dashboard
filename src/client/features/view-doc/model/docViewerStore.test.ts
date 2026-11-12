import { beforeEach, describe, expect, it } from "vitest";
import { useDocViewerStore } from "./docViewerStore";

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
});
