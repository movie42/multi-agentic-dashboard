import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useStoredListStore } from "@/client/shared/lib/storedListStore";
import { useWorkspacePrefs } from "./useWorkspacePrefs";
import type { WorkspaceScope } from "./workspaceWindow";

const KEY = "agent-control:selected-repo";

interface ProbeProps {
  scope?: WorkspaceScope | null;
}

function Probe({ scope = null }: ProbeProps) {
  const prefs = useWorkspacePrefs(scope);
  return (
    <>
      <output>{`${prefs.selectedRepo ?? "-"}/${prefs.selectedWorktreeId ?? "-"}/${prefs.showingTodo ? "todo" : ""}`}</output>
      <button type="button" onClick={() => prefs.selectWorktree("b", "wt-b")}>
        worktree
      </button>
      <button type="button" onClick={prefs.openTodo}>
        todo
      </button>
    </>
  );
}

afterEach(() => {
  window.localStorage.clear();
  useStoredListStore.setState({ lists: {} });
});

describe("useWorkspacePrefs", () => {
  it("shares the selection through storage when the window has no scope", async () => {
    render(<Probe />);
    await userEvent.click(screen.getByRole("button", { name: "worktree" }));
    expect(screen.getByRole("status").textContent).toBe("b/wt-b/");
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")).toEqual(["b", "wt-b"]);
  });

  it("starts a scoped window on its project and worktree, whatever the stored selection is", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["other"]));
    render(<Probe scope={{ repo: "a", worktreeId: "wt-a" }} />);
    expect(screen.getByRole("status").textContent).toBe("a/wt-a/");
  });

  it("keeps a scoped window's moves inside that window", async () => {
    window.localStorage.setItem(KEY, JSON.stringify(["other"]));
    render(<Probe scope={{ repo: "a", worktreeId: null }} />);
    await userEvent.click(screen.getByRole("button", { name: "worktree" }));
    expect(screen.getByRole("status").textContent).toBe("b/wt-b/");
    await userEvent.click(screen.getByRole("button", { name: "todo" }));
    expect(screen.getByRole("status").textContent).toBe("-/-/todo");
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")).toEqual(["other"]);
  });

  it("does not follow another window's selection when scoped", () => {
    render(<Probe scope={{ repo: "a", worktreeId: null }} />);
    act(() => useStoredListStore.getState().write(KEY, ["moved"]));
    expect(screen.getByRole("status").textContent).toBe("a/-/");
  });
});
