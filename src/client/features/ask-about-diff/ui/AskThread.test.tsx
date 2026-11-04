import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskAnchor, AskContext, AskThread } from "@/common/intentDiff/types";
import { postAction } from "@/client/shared/api/actions";
import { useToastStore } from "@/client/shared/model/toastStore";
import { AskBoardContext, type AskBoard } from "../model/useAskBoard";
import { AskDraft, ThreadView } from "./AskThread";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));

vi.mock("./AnswerMarkdown", () => ({ AnswerMarkdown: ({ text }: { text: string }) => <p>{text}</p> }));

const post = vi.mocked(postAction);
const anchor: AskAnchor = { kind: "lines", file: "src/a.ts", startLine: 3, endLine: 5 };
const context: AskContext = { label: "a.ts", planItem: null, intents: [], diff: "+x" };
const thread: AskThread = {
  id: "t-1",
  worktreePath: "/work/repo",
  anchor,
  label: "a.ts",
  target: { kind: "fresh", reason: "chosen" },
  sessionId: "ask-session",
  cwd: "/work/repo",
  turns: [{ question: "왜?", answer: "이유", error: null, askedAt: 1, answeredAt: 2 }],
  createdAt: 1,
  updatedAt: 2,
};

function boardWith(ask: AskBoard["ask"]): AskBoard {
  return { threads: [], live: {}, ask, reload: () => {}, writerOf: () => "writer-session" };
}

beforeEach(() => {
  post.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe("AskDraft", () => {
  it("asks the writer session about the lines and closes when the thread starts", async () => {
    const onClose = vi.fn();
    const ask = vi.fn<AskBoard["ask"]>(async (_input, onThread) => onThread?.(thread));
    render(
      <AskBoardContext value={boardWith(ask)}>
        <AskDraft anchor={anchor} context={context} onClose={onClose} />
      </AskBoardContext>,
    );
    await userEvent.type(screen.getByRole("textbox"), "이 줄은 왜 있어?");
    await userEvent.click(screen.getByRole("button", { name: "묻기" }));
    expect(ask).toHaveBeenCalledWith(
      { question: "이 줄은 왜 있어?", anchor, context, writerSessionId: "writer-session", fresh: false },
      expect.any(Function),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the question with the error and a toast on failure", async () => {
    const ask = vi.fn<AskBoard["ask"]>().mockRejectedValue(new Error("질문을 보내지 못했어요 (500)"));
    render(
      <AskBoardContext value={boardWith(ask)}>
        <AskDraft anchor={anchor} context={context} onClose={() => {}} />
      </AskBoardContext>,
    );
    await userEvent.type(screen.getByRole("textbox"), "왜?");
    await userEvent.click(screen.getByRole("button", { name: "묻기" }));
    expect(await screen.findByText("질문을 보내지 못했어요 (500)")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("왜?");
    expect(useToastStore.getState().toasts).toMatchObject([{ tone: "error", message: "질문을 보내지 못했어요 (500)" }]);
    expect(console.error).toHaveBeenCalledWith("[ask]", "질문을 보내지 못했어요 (500)", {}, expect.any(Error));
  });

  it("ignores a second click while the question is in flight", async () => {
    const answer = Promise.withResolvers<void>();
    const ask = vi.fn<AskBoard["ask"]>().mockReturnValue(answer.promise);
    render(
      <AskBoardContext value={boardWith(ask)}>
        <AskDraft anchor={anchor} context={context} onClose={() => {}} />
      </AskBoardContext>,
    );
    await userEvent.type(screen.getByRole("textbox"), "왜?");
    await userEvent.click(screen.getByRole("button", { name: "묻기" }));
    const button = await screen.findByRole("button", { name: "보내는 중…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
    expect(ask).toHaveBeenCalledTimes(1);
    answer.resolve();
    expect(await screen.findByRole("button", { name: "묻기" })).toBeTruthy();
  });
});

describe("ThreadView", () => {
  it("sends a follow-up and clears the box", async () => {
    const ask = vi.fn<AskBoard["ask"]>().mockResolvedValue();
    render(
      <AskBoardContext value={boardWith(ask)}>
        <ThreadView thread={thread} />
      </AskBoardContext>,
    );
    await userEvent.type(screen.getByRole("textbox"), "그럼 이건?");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    expect(ask).toHaveBeenCalledWith({ question: "그럼 이건?", threadId: "t-1" });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("shows a failed resume inline and as a toast", async () => {
    post.mockRejectedValue(new Error("터미널을 열 수 없어요"));
    render(
      <AskBoardContext value={boardWith(vi.fn())}>
        <ThreadView thread={thread} />
      </AskBoardContext>,
    );
    await userEvent.click(screen.getByRole("button", { name: "터미널에서 이어 가기" }));
    expect(await screen.findByText("터미널을 열 수 없어요")).toBeTruthy();
    expect(useToastStore.getState().toasts).toMatchObject([{ tone: "error", message: "터미널을 열 수 없어요" }]);
  });
});
