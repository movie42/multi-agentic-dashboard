import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorktreeSummary } from "@/common/board/types";
import { postAction } from "@/client/shared/api/actions";
import { requestRemoveWorktree, useRemoveWorktreeRequest } from "../model/removeWorktreeRequest";
import { RemoveWorktreeHost } from "./RemoveWorktreeHost";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));

const worktree: WorktreeSummary = {
  worktreeId: "wt-1",
  repo: "repo",
  name: "feat-a",
  branch: "feat/a",
  path: "/work/feat-a",
  projectPath: "/work/repo",
  isMain: false,
  parentWorktreeId: null,
  unread: false,
  lastActivityAt: 1,
  flowTasks: [],
  otherFlowTasks: [],
  pullRequest: { kind: "none" },
  jira: { kind: "not-applicable" },
  featureId: null,
};

beforeEach(() => {
  vi.mocked(postAction).mockReset();
  useRemoveWorktreeRequest.setState({ request: null });
});

describe("RemoveWorktreeHost", () => {
  it("shows nothing until someone asks to remove a worktree", () => {
    render(<RemoveWorktreeHost />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the confirmation as a modal and closes it on cancel", async () => {
    render(<RemoveWorktreeHost />);
    act(() => requestRemoveWorktree(worktree, 3));
    const dialog = screen.getByRole("dialog", { name: "워크트리 삭제" });
    expect(dialog.textContent).toContain("feat-a");
    expect(dialog.textContent).toContain("열린 세션 3개도 함께 닫혀요.");
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(postAction).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    render(<RemoveWorktreeHost />);
    act(() => requestRemoveWorktree(worktree, 0));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers a close button once the worktree is gone", async () => {
    vi.mocked(postAction).mockResolvedValue();
    render(<RemoveWorktreeHost />);
    act(() => requestRemoveWorktree(worktree, 0));
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    await userEvent.click(await screen.findByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
