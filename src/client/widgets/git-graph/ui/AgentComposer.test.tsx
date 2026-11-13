import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postAction } from "@/client/shared/api/actions";
import type { GraphCommit } from "@/common/gitGraph/types";
import type { AgentCard } from "@/common/orca/types";
import { agentCard } from "../../../../../test/fixtures";
import { AgentComposer } from "./AgentComposer";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));

const post = vi.mocked(postAction);
const commit: GraphCommit = {
  sha: "abcdef1234567890",
  parents: [],
  author: "T",
  time: 0,
  subject: "feat b",
  refs: [{ kind: "branch", name: "feat/b", current: false }],
};

function renderComposer(sessions = [agentCard({ id: "s1", terminalHandle: "term-1", prompt: "기존 세션" })]) {
  const client = new QueryClient();
  const ui = (list: AgentCard[]) => (
    <QueryClientProvider client={client}>
      <AgentComposer worktreePath="/w" sessions={list} attached={[commit]} onDetach={() => {}} onClose={() => {}} />
    </QueryClientProvider>
  );
  const { rerender } = render(ui(sessions));
  return { rerender: (list: AgentCard[]) => rerender(ui(list)) };
}

beforeEach(() => post.mockResolvedValue());
afterEach(() => window.localStorage.clear());

describe("AgentComposer", () => {
  it("sends to the session with the attached commits in front", async () => {
    renderComposer();
    await userEvent.type(screen.getByRole("textbox"), "main 위로 리베이스해 줘{Enter}");
    expect(post).toHaveBeenCalledWith({
      type: "send-prompt",
      terminalHandle: "term-1",
      text: '깃 그래프에서 고른 커밋:\n- abcdef1234 "feat b" (feat/b)\n\nmain 위로 리베이스해 줘',
    });
    expect(await screen.findByText("보냈어요. 답은 위에 떠요.")).toBeTruthy();
  });

  it("launches a new session, waits for it, then keeps talking to it", async () => {
    const { rerender } = renderComposer([]);
    await userEvent.type(screen.getByRole("textbox"), "정리해 줘");
    await userEvent.click(screen.getByRole("button", { name: "세션 시작" }));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "launch-agent", worktreePath: "/w" }));
    expect(await screen.findByText(/새 세션이 뜨기를 기다리는 중/)).toBeTruthy();

    rerender([agentCard({ id: "fresh", terminalHandle: "term-new", prompt: "정리해 줘", lastMessage: "정리했어요" })]);
    expect(await screen.findByText("정리했어요")).toBeTruthy();
    expect(window.localStorage.getItem("git-graph-sessions:/w")).toContain("fresh");
    await userEvent.type(screen.getByRole("textbox"), "고마워{Enter}");
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ type: "send-prompt", terminalHandle: "term-new" }));
  });
});
