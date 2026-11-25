import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunnerPermission } from "@/common/runner/types";
import { postAction } from "@/client/shared/api/actions";
import { useToastStore } from "@/client/shared/model/toastStore";
import { PermissionPrompt } from "./PermissionPrompt";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));

const post = vi.mocked(postAction);

const tool: RunnerPermission = {
  id: "req-1",
  receivedAt: 0,
  toolName: "Bash",
  toolInput: { command: "rm -rf dist" },
  suggestions: [],
};

function asking(questions: unknown[]): RunnerPermission {
  return { id: "req-2", receivedAt: 0, toolName: "AskUserQuestion", toolInput: { questions }, suggestions: [] };
}

const single = {
  question: "어떻게 맞출까요?",
  header: "Pull 방식",
  multiSelect: false,
  options: [{ label: "원격으로 맞추기", description: "reset --hard" }, { label: "그대로 두기" }],
};

const multi = {
  question: "무엇을 확인할까요?",
  multiSelect: true,
  options: [{ label: "타입" }, { label: "린트" }, { label: "테스트" }],
};

beforeEach(() => {
  post.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe("PermissionPrompt", () => {
  it("keeps the allow and deny buttons for a tool request", async () => {
    post.mockResolvedValue();
    render(<PermissionPrompt terminalHandle="s1" permission={tool} />);
    expect(screen.getByText("Bash 실행 허락이 필요해요")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "허용" }));
    expect(post).toHaveBeenCalledWith({
      type: "answer-permission",
      terminalHandle: "s1",
      requestId: "req-1",
      answer: { behavior: "allow", suggestionIndex: null },
    });
  });

  it("shows the question with its options and sends a single choice at once", async () => {
    post.mockResolvedValue();
    render(<PermissionPrompt terminalHandle="s1" permission={asking([single])} />);
    expect(screen.getByText("Pull 방식")).toBeTruthy();
    expect(screen.getByText("어떻게 맞출까요?")).toBeTruthy();
    expect(screen.getByText("reset --hard")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "허용" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /원격으로 맞추기/ }));
    expect(post).toHaveBeenCalledWith({
      type: "answer-permission",
      terminalHandle: "s1",
      requestId: "req-2",
      answer: { behavior: "answer", answers: { "어떻게 맞출까요?": "원격으로 맞추기" } },
    });
    expect(await screen.findByText("보냈어요. 상태가 곧 바뀌어요.")).toBeTruthy();
  });

  it("sends a typed answer with Enter for a single question", async () => {
    post.mockResolvedValue();
    render(<PermissionPrompt terminalHandle="s1" permission={asking([single])} />);
    await userEvent.type(screen.getByRole("textbox", { name: "어떻게 맞출까요? 직접 입력" }), "rebase로 해 줘{Enter}");
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ answer: { behavior: "answer", answers: { "어떻게 맞출까요?": "rebase로 해 줘" } } }),
    );
  });

  it("collects every question before sending, joining multiple choices", async () => {
    post.mockResolvedValue();
    render(<PermissionPrompt terminalHandle="s1" permission={asking([single, multi])} />);
    const sendButton = screen.getByRole("button", { name: "보내기" });
    await userEvent.click(screen.getByRole("button", { name: /그대로 두기/ }));
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: /타입/ }));
    await userEvent.click(screen.getByRole("button", { name: /테스트/ }));
    expect(screen.getByRole("button", { name: /테스트/ }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(sendButton);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: { behavior: "answer", answers: { "어떻게 맞출까요?": "그대로 두기", "무엇을 확인할까요?": "타입, 테스트" } },
      }),
    );
  });

  it("shows a failure inline and allows another try", async () => {
    post.mockRejectedValueOnce(new Error("이미 끝난 권한 요청이에요.")).mockResolvedValueOnce();
    render(<PermissionPrompt terminalHandle="s1" permission={asking([single])} />);
    await userEvent.click(screen.getByRole("button", { name: /그대로 두기/ }));
    expect(await screen.findByText("못 보냈어요: 이미 끝난 권한 요청이에요.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /그대로 두기/ }));
    expect(await screen.findByText("보냈어요. 상태가 곧 바뀌어요.")).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe("PermissionPrompt drawn with A2UI", () => {
  it("sends a deny with the typed reason", async () => {
    post.mockResolvedValue();
    render(<PermissionPrompt terminalHandle="s1" permission={tool} />);
    await userEvent.click(screen.getByRole("button", { name: "거부" }));
    await userEvent.type(screen.getByPlaceholderText("거부 사유 (Claude에게 전달돼요)"), "  지우지 마  ");
    await userEvent.click(screen.getByRole("button", { name: "거부" }));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ answer: { behavior: "deny", message: "지우지 마" } }));
  });

  it("allows with a suggestion and shows its rule unescaped", async () => {
    post.mockResolvedValue();
    const withRule: RunnerPermission = { ...tool, suggestions: [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "rm:*" }], destination: "session" }] };
    render(<PermissionPrompt terminalHandle="s1" permission={withRule} />);
    await userEvent.click(screen.getByRole("button", { name: /다시 묻지 않기 · Bash\(rm:\*\)/ }));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ answer: { behavior: "allow", suggestionIndex: 0 } }));
  });
});
