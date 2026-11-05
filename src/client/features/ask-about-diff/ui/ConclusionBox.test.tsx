import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConclusionRequest } from "@/common/intentDiff/conclusion";
import type { AskConclusion, AskThread } from "@/common/intentDiff/types";
import { useToastStore } from "@/client/shared/model/toastStore";
import { ConclusionBox } from "./ConclusionBox";

function thread(conclusion: AskConclusion | null): AskThread {
  return {
    id: "t-1",
    worktreePath: "/w",
    anchor: { kind: "lines", file: "a.ts", startLine: 1, endLine: 2 },
    label: "a.ts",
    target: { kind: "fresh", reason: "chosen" },
    sessionId: "s",
    cwd: "/w",
    turns: [{ question: "왜?", answer: "이유", error: null, askedAt: 1, answeredAt: 2 }],
    conclusion,
    createdAt: 1,
    updatedAt: 2,
  };
}

const draft: AskConclusion = { text: "a.ts의 이름을 바꿔요", needsChange: true, draftedAt: 3, confirmedAt: null, sentAt: null };

afterEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe("ConclusionBox", () => {
  it("asks the session for a draft, and not before the answer is in", async () => {
    const conclude = vi.fn<(request: ConclusionRequest) => Promise<void>>().mockResolvedValue();
    const { rerender } = render(<ConclusionBox thread={thread(null)} waiting conclude={conclude} />);
    expect(screen.getByRole("button", { name: "결론 정리" })).toHaveProperty("disabled", true);
    rerender(<ConclusionBox thread={thread(null)} waiting={false} conclude={conclude} />);
    await userEvent.click(screen.getByRole("button", { name: "결론 정리" }));
    expect(conclude).toHaveBeenCalledWith({ type: "draft", threadId: "t-1" });
  });

  it("confirms the edited draft", async () => {
    const conclude = vi.fn<(request: ConclusionRequest) => Promise<void>>().mockResolvedValue();
    render(<ConclusionBox thread={thread(draft)} waiting={false} conclude={conclude} />);
    const box = screen.getByRole("textbox", { name: "결론" });
    await userEvent.clear(box);
    await userEvent.type(box, "b.ts도 같이 바꿔요");
    await userEvent.click(screen.getByRole("button", { name: "확정" }));
    expect(conclude).toHaveBeenCalledWith({ type: "confirm", threadId: "t-1", text: "b.ts도 같이 바꿔요" });
  });

  it("flips the session's judgment with one click", async () => {
    const conclude = vi.fn<(request: ConclusionRequest) => Promise<void>>().mockResolvedValue();
    render(<ConclusionBox thread={thread(draft)} waiting={false} conclude={conclude} />);
    await userEvent.click(screen.getByRole("button", { name: "수정 필요" }));
    expect(conclude).toHaveBeenCalledWith({ type: "judge", threadId: "t-1", needsChange: false });
  });

  it("shows a sent conclusion as text with when it was sent, and reopens it for editing on click", async () => {
    const sent = { ...draft, confirmedAt: 4, sentAt: new Date(2026, 10, 5, 14, 30).getTime() };
    render(<ConclusionBox thread={thread(sent)} waiting={false} conclude={vi.fn()} />);
    expect(screen.getByText(/수정 보냄 ·/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "확정" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: draft.text }));
    expect(screen.getByRole("textbox", { name: "결론" })).toHaveProperty("value", draft.text);
  });

  it("keeps the draft and shows why when the request fails", async () => {
    const conclude = vi.fn<(request: ConclusionRequest) => Promise<void>>().mockRejectedValue(new Error("결론 초안을 읽지 못했어요"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ConclusionBox thread={thread(null)} waiting={false} conclude={conclude} />);
    await userEvent.click(screen.getByRole("button", { name: "결론 정리" }));
    expect(await screen.findAllByText("결론 초안을 읽지 못했어요")).not.toHaveLength(0);
  });
});
