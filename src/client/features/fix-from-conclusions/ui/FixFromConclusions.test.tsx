import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskConclusion, AskThread } from "@/common/intentDiff/types";
import { postAction } from "@/client/shared/api/actions";
import { useToastStore } from "@/client/shared/model/toastStore";
import { FixFromConclusions } from "./FixFromConclusions";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));
const post = vi.mocked(postAction);

const confirmed: AskConclusion = { text: "이름을 바꿔요", needsChange: true, draftedAt: 1, confirmedAt: 2, sentAt: null };

function thread(id: string, conclusion: AskConclusion | null = confirmed): AskThread {
  return {
    id,
    worktreePath: "/w",
    anchor: { kind: "lines", file: `src/${id}.ts`, startLine: 3, endLine: 3 },
    label: `${id}.ts`,
    target: { kind: "fresh", reason: "chosen" },
    sessionId: `s-${id}`,
    cwd: "/w",
    turns: [],
    conclusion: conclusion && { ...conclusion, text: `${id} ${conclusion.text}` },
    createdAt: 1,
    updatedAt: 1,
  };
}

function stubBoard(agents: { worktreePath: string; state: string }[]) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true, board: { agents } })))));
}

function renderWith(threads: AskThread[], markSent = vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FixFromConclusions worktreePath="/w" threads={threads} markSent={markSent} />
    </QueryClientProvider>,
  );
  return markSent;
}

beforeEach(() => {
  post.mockReset();
  stubBoard([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  useToastStore.setState({ toasts: [] });
});

describe("FixFromConclusions", () => {
  it("is disabled with nothing to send", () => {
    renderWith([thread("a", null), thread("b", { ...confirmed, needsChange: false })]);
    expect(screen.getByRole("button", { name: "수정하기" })).toHaveProperty("disabled", true);
  });

  it("sends only the checked conclusions to a new session in the worktree and marks them sent", async () => {
    post.mockResolvedValue();
    const markSent = renderWith([thread("a"), thread("b")]);
    await userEvent.click(screen.getByRole("button", { name: "수정하기" }));
    expect(screen.getByRole("heading", { name: "결론 2개로 수정하기" })).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: /b 이름을 바꿔요/ }));
    expect(screen.getByRole("heading", { name: "결론 1개로 수정하기" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(post).toHaveBeenCalledTimes(1);
    const action = post.mock.calls[0]?.[0];
    expect(action).toMatchObject({ type: "launch-agent", worktreePath: "/w" });
    expect(action && "prompt" in action ? action.prompt : "").toContain("a 이름을 바꿔요");
    expect(action && "prompt" in action ? action.prompt : "").not.toContain("b 이름을 바꿔요");
    expect(markSent).toHaveBeenCalledWith(["a"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("warns when a session is working in the same worktree", async () => {
    stubBoard([{ worktreePath: "/w", state: "working" }]);
    renderWith([thread("a")]);
    await userEvent.click(screen.getByRole("button", { name: "수정하기" }));
    expect(await screen.findByText("이 워크트리에서 일하는 세션이 있어요. 같은 파일을 고칠 수 있어요.")).toBeTruthy();
  });

  it("keeps the dialog open and does not mark anything sent when launching fails", async () => {
    post.mockRejectedValue(new Error("orca failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const markSent = renderWith([thread("a")]);
    await userEvent.click(screen.getByRole("button", { name: "수정하기" }));
    await userEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(markSent).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
