import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postAction } from "@/client/shared/api/actions";
import { useToastStore } from "@/client/shared/model/toastStore";
import { SessionTitle } from "./SessionTitle";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));

const post = vi.mocked(postAction);

beforeEach(() => {
  post.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  useToastStore.setState({ toasts: [] });
});

async function rename(title: string) {
  await userEvent.click(screen.getByRole("button", { name: "제목 수정" }));
  const input = screen.getByPlaceholderText("세션 제목");
  await userEvent.clear(input);
  await userEvent.type(input, title);
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
}

describe("SessionTitle", () => {
  it("saves the new title and shows it until the poll catches up", async () => {
    post.mockResolvedValue();
    const onRenamed = vi.fn();
    render(<SessionTitle sessionId="s-1" title="옛 제목" titleSource="ai" fallback="s-1" textClassName="" onRenamed={onRenamed} />);
    await rename("새   제목");
    expect(post).toHaveBeenCalledWith({ type: "rename-session", sessionId: "s-1", title: "새 제목" });
    expect(await screen.findByTitle("새 제목")).toBeTruthy();
    expect(onRenamed).toHaveBeenCalledWith("새 제목");
    expect(screen.queryByText("자동")).toBeNull();
  });

  it("keeps the form open with the error and a toast on failure", async () => {
    post.mockRejectedValue(new Error("기록 파일을 쓸 수 없어요"));
    render(<SessionTitle sessionId="s-1" title="옛 제목" titleSource="custom" fallback="s-1" textClassName="" />);
    await rename("새 제목");
    expect(await screen.findByText("기록 파일을 쓸 수 없어요")).toBeTruthy();
    expect(screen.getByPlaceholderText("세션 제목")).toBeTruthy();
    expect(useToastStore.getState().toasts).toMatchObject([{ tone: "error", message: "기록 파일을 쓸 수 없어요" }]);
    expect(console.error).toHaveBeenCalledWith("[rename-session]", "기록 파일을 쓸 수 없어요", {}, expect.any(Error));
  });

  it("ignores a second submit while saving", async () => {
    const request = Promise.withResolvers<void>();
    post.mockReturnValue(request.promise);
    render(<SessionTitle sessionId="s-1" title="옛 제목" titleSource="custom" fallback="s-1" textClassName="" />);
    await rename("새 제목");
    const button = await screen.findByRole("button", { name: "저장 중…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
    expect(post).toHaveBeenCalledTimes(1);
    request.resolve();
    expect(await screen.findByTitle("새 제목")).toBeTruthy();
  });
});
