import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorktreeSummary } from "@/common/orca/types";
import { postAction } from "@/client/shared/api/actions";
import { useToastStore } from "@/client/shared/model/toastStore";
import { LaunchAgent } from "./LaunchAgent";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn(), uploadAttachment: vi.fn() }));

const post = vi.mocked(postAction);

const worktree: WorktreeSummary = {
  worktreeId: "wt-1",
  repo: "repo",
  name: "main",
  branch: "main",
  path: "/work/repo",
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

afterEach(() => {
  window.localStorage.clear();
  useToastStore.setState({ toasts: [] });
});

describe("LaunchAgent", () => {
  it("launches in the chosen worktree and says where", async () => {
    post.mockResolvedValue();
    render(<LaunchAgent worktrees={[worktree]} showRepo draftKey="all" />);
    await userEvent.type(screen.getByRole("textbox"), "테스트 고쳐줘");
    await userEvent.click(screen.getByRole("button", { name: "새 세션 시작" }));
    expect(post).toHaveBeenCalledWith({ type: "launch-agent", worktreePath: "/work/repo", prompt: "테스트 고쳐줘" });
    expect(await screen.findByText("repo / main에서 새 세션을 열었어요. 몇 초 안에 카드로 나타나요.")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("shows the failure inline and as a toast", async () => {
    post.mockRejectedValue(new Error("orca 응답 없음"));
    render(<LaunchAgent worktrees={[worktree]} showRepo={false} draftKey="repo" />);
    await userEvent.click(screen.getByRole("button", { name: "새 세션 시작" }));
    expect(await screen.findByText("시작하지 못했어요: orca 응답 없음")).toBeTruthy();
    expect(useToastStore.getState().toasts).toMatchObject([{ tone: "error", message: "orca 응답 없음" }]);
    expect(console.error).toHaveBeenCalledWith("[launch-agent]", "orca 응답 없음", {}, expect.any(Error));
  });

  it("ignores a second click while launching", async () => {
    const request = Promise.withResolvers<void>();
    post.mockReturnValue(request.promise);
    render(<LaunchAgent worktrees={[worktree]} showRepo={false} draftKey="repo" />);
    await userEvent.click(screen.getByRole("button", { name: "새 세션 시작" }));
    const button = await screen.findByRole("button", { name: "시작하는 중" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
    expect(post).toHaveBeenCalledTimes(1);
    request.resolve();
    expect(await screen.findByRole("button", { name: "새 세션 시작" })).toBeTruthy();
  });

  it("keeps an unsent prompt per launcher across a remount", async () => {
    const { unmount } = render(<LaunchAgent worktrees={[worktree]} showRepo draftKey="all" />);
    await userEvent.type(screen.getByRole("textbox"), "아직 안 보냄");
    unmount();

    render(<LaunchAgent worktrees={[worktree]} showRepo draftKey="all" />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("아직 안 보냄");
  });
});
