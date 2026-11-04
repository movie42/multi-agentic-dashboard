import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postAction } from "@/client/shared/api/actions";
import { useToastStore } from "@/client/shared/model/toastStore";
import { QuickReply } from "./QuickReply";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn(), uploadAttachment: vi.fn() }));

const post = vi.mocked(postAction);

beforeEach(() => {
  post.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe("QuickReply", () => {
  it("sends the text, clears the box and says it was sent", async () => {
    post.mockResolvedValue();
    render(<QuickReply terminalHandle="term-1" working={false} />);
    const box = screen.getByRole("textbox");
    await userEvent.type(box, "계속해");
    await userEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(post).toHaveBeenCalledWith({ type: "send-prompt", terminalHandle: "term-1", text: "계속해" });
    expect(await screen.findByText("보냈어요. 상태가 곧 바뀌어요.")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("shows the failure inline and as a toast", async () => {
    post.mockRejectedValue(new Error("터미널을 찾을 수 없어요"));
    render(<QuickReply terminalHandle="term-1" working={false} />);
    await userEvent.type(screen.getByRole("textbox"), "계속해");
    await userEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(await screen.findByText("못 보냈어요: 터미널을 찾을 수 없어요")).toBeTruthy();
    expect(useToastStore.getState().toasts).toMatchObject([{ tone: "error", message: "터미널을 찾을 수 없어요" }]);
    expect(console.error).toHaveBeenCalledWith("[quick-reply]", "터미널을 찾을 수 없어요", {}, expect.any(Error));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("계속해");
  });

  it("ignores a second click while the first send is in flight", async () => {
    const request = Promise.withResolvers<void>();
    post.mockReturnValue(request.promise);
    render(<QuickReply terminalHandle="term-1" working={false} />);
    await userEvent.type(screen.getByRole("textbox"), "계속해");
    await userEvent.click(screen.getByRole("button", { name: "보내기" }));
    const button = await screen.findByRole("button", { name: "보내는 중" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
    await userEvent.type(screen.getByRole("textbox"), "{Enter}");
    expect(post).toHaveBeenCalledTimes(1);
    request.resolve();
    expect(await screen.findByText("보냈어요. 상태가 곧 바뀌어요.")).toBeTruthy();
  });

  it("hides the last result once the text changes", async () => {
    post.mockResolvedValue();
    render(<QuickReply terminalHandle="term-1" working={false} />);
    await userEvent.type(screen.getByRole("textbox"), "계속해{Enter}");
    expect(await screen.findByText("보냈어요. 상태가 곧 바뀌어요.")).toBeTruthy();
    await userEvent.type(screen.getByRole("textbox"), "a");
    expect(screen.queryByText("보냈어요. 상태가 곧 바뀌어요.")).toBeNull();
  });
});
