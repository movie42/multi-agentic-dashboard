import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorktreeSummary } from "@/common/board/types";
import { postAction } from "@/client/shared/api/actions";
import { RemoveWorktree } from "./RemoveWorktree";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));

const post = vi.mocked(postAction);

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
  post.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("RemoveWorktree", () => {
  it("is hidden on the repo's main checkout", () => {
    const { container } = render(<RemoveWorktree worktree={{ ...worktree, isMain: true }} sessionCount={0} onCancel={() => {}} />);
    expect(container.textContent).toBe("");
  });

  it("hands the cancel back to whoever opened it", async () => {
    const onCancel = vi.fn();
    render(<RemoveWorktree worktree={worktree} sessionCount={0} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
  });

  it("asks before removing and shows progress until it finishes", async () => {
    const request = Promise.withResolvers<void>();
    post.mockReturnValue(request.promise);
    render(<RemoveWorktree worktree={worktree} sessionCount={2} onCancel={() => {}} />);
    expect(screen.getByText("열린 세션 2개도 함께 닫혀요.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(post).toHaveBeenCalledWith({ type: "remove-worktree", worktreePath: "/work/feat-a", force: false });
    expect(screen.getByText("지우는 중")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    request.resolve();
    expect(await screen.findByText("지웠어요. 몇 초 안에 보드에서 사라져요.")).toBeTruthy();
  });

  it("offers a forced removal after a failure", async () => {
    post.mockRejectedValueOnce(new Error("contains modified files")).mockResolvedValueOnce();
    render(<RemoveWorktree worktree={worktree} sessionCount={0} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("지우지 못했어요: contains modified files")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "강제로 삭제" }));
    expect(post).toHaveBeenLastCalledWith({ type: "remove-worktree", worktreePath: "/work/feat-a", force: true });
    expect(await screen.findByText("지웠어요. 몇 초 안에 보드에서 사라져요.")).toBeTruthy();
  });
});
