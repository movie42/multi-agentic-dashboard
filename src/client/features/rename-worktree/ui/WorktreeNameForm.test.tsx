import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorktreeSummary } from "@/common/orca/types";
import { postAction } from "@/client/shared/api/actions";
import { useToastStore } from "@/client/shared/model/toastStore";
import { WorktreeNameForm } from "./WorktreeNameForm";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));

const post = vi.mocked(postAction);

const worktree: WorktreeSummary = {
  worktreeId: "wt-1",
  repo: "repo",
  name: "feat-a",
  branch: "feat/a",
  path: "/work/feat-a",
  isMain: false,
  parentWorktreeId: null,
  unread: false,
  lastActivityAt: 1,
  flowTasks: [],
  otherFlowTasks: [],
  pullRequest: { kind: "none" },
  featureId: null,
};

async function typeName(name: string) {
  const input = screen.getByRole("textbox", { name: "워크트리 이름" });
  await userEvent.clear(input);
  if (name) await userEvent.type(input, name);
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
}

beforeEach(() => {
  post.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe("WorktreeNameForm", () => {
  it("saves the collapsed name as the Orca display name", async () => {
    post.mockResolvedValue();
    const onDone = vi.fn();
    render(<WorktreeNameForm worktree={worktree} onDone={onDone} />);
    await typeName("결제   화면");
    expect(post).toHaveBeenCalledWith({ type: "rename-worktree", worktreePath: "/work/feat-a", name: "결제 화면" });
    expect(onDone).toHaveBeenCalledWith("결제 화면");
  });

  it("closes without a request when the name is blank or unchanged", async () => {
    const onDone = vi.fn();
    render(<WorktreeNameForm worktree={worktree} onDone={onDone} />);
    await typeName("");
    expect(post).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith(null);
  });

  it("stays open with the error on failure", async () => {
    post.mockRejectedValue(new Error("worktree not found"));
    const onDone = vi.fn();
    render(<WorktreeNameForm worktree={worktree} onDone={onDone} />);
    await typeName("새 이름");
    expect(await screen.findByText("worktree not found")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
