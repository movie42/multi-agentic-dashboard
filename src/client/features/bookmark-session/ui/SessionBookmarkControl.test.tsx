import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionBookmark } from "@/common/sessions/types";
import { postAction } from "@/client/shared/api/actions";
import { useToastStore } from "@/client/shared/model/toastStore";
import { useBookmarkOverrides, type BookmarkTarget } from "../model/useSessionBookmark";
import { BookmarkMark, BookmarkMemo, BookmarkStar } from "./SessionBookmarkControl";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));

const post = vi.mocked(postAction);

const target: BookmarkTarget = { sessionId: "s-1", name: "세션", cwd: "/work/repo", bookmark: null };
const saved: SessionBookmark = { name: "세션", memo: "", createdAt: "2026-11-01", lastOpenedAt: null };

beforeEach(() => {
  post.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  useToastStore.setState({ toasts: [] });
  useBookmarkOverrides.setState({ overrides: {} });
});

describe("BookmarkStar", () => {
  it("bookmarks and shows the star on every screen that reads the session", async () => {
    post.mockResolvedValue();
    const onChanged = vi.fn();
    render(
      <>
        <BookmarkStar target={target} onChanged={onChanged} />
        <BookmarkMark target={target} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "북마크" }));
    expect(post).toHaveBeenCalledWith({ type: "bookmark-session", sessionId: "s-1", name: "세션", cwd: "/work/repo", memo: "" });
    expect(await screen.findByRole("button", { name: "북마크 해제" })).toBeTruthy();
    expect(screen.getByTitle("북마크").textContent).toBe("★");
    expect(onChanged).toHaveBeenCalledWith({ name: "세션", memo: "", createdAt: "", lastOpenedAt: null });
  });

  it("shows the failure inline and as a toast", async () => {
    post.mockRejectedValue(new Error("sb를 찾을 수 없어요"));
    render(<BookmarkStar target={target} />);
    await userEvent.click(screen.getByRole("button", { name: "북마크" }));
    expect(await screen.findByText("sb를 찾을 수 없어요")).toBeTruthy();
    expect(useToastStore.getState().toasts).toMatchObject([{ tone: "error", message: "sb를 찾을 수 없어요" }]);
    expect(console.error).toHaveBeenCalledWith("[bookmark]", "sb를 찾을 수 없어요", {}, expect.any(Error));
  });

  it("ignores a second click while saving", async () => {
    const request = Promise.withResolvers<void>();
    post.mockReturnValue(request.promise);
    render(<BookmarkStar target={target} />);
    const star = screen.getByRole("button", { name: "북마크" });
    await userEvent.click(star);
    expect((star as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(star);
    expect(post).toHaveBeenCalledTimes(1);
    request.resolve();
    expect(await screen.findByRole("button", { name: "북마크 해제" })).toBeTruthy();
  });
});

describe("BookmarkMemo", () => {
  const bookmarked: BookmarkTarget = { ...target, bookmark: saved };

  it("saves the memo and closes the form", async () => {
    post.mockResolvedValue();
    render(<BookmarkMemo target={bookmarked} />);
    await userEvent.click(screen.getByRole("button", { name: "메모 추가" }));
    await userEvent.type(screen.getByPlaceholderText("북마크 메모 (비워도 돼요)"), " 다시 볼 것 ");
    await userEvent.click(screen.getByRole("button", { name: "메모 저장" }));
    expect(post).toHaveBeenCalledWith({ type: "bookmark-session", sessionId: "s-1", name: "세션", cwd: "/work/repo", memo: "다시 볼 것" });
    expect(await screen.findByText("다시 볼 것")).toBeTruthy();
    expect(screen.queryByPlaceholderText("북마크 메모 (비워도 돼요)")).toBeNull();
  });

  it("keeps the form open with the error and a toast on failure", async () => {
    post.mockRejectedValue(new Error("메모를 쓸 수 없어요"));
    render(<BookmarkMemo target={bookmarked} />);
    await userEvent.click(screen.getByRole("button", { name: "메모 추가" }));
    await userEvent.click(screen.getByRole("button", { name: "메모 저장" }));
    expect(await screen.findByText("메모를 쓸 수 없어요")).toBeTruthy();
    expect(screen.getByPlaceholderText("북마크 메모 (비워도 돼요)")).toBeTruthy();
    expect(useToastStore.getState().toasts).toMatchObject([{ tone: "error", message: "메모를 쓸 수 없어요" }]);
  });

  it("ignores a second submit while saving", async () => {
    const request = Promise.withResolvers<void>();
    post.mockReturnValue(request.promise);
    render(<BookmarkMemo target={bookmarked} />);
    await userEvent.click(screen.getByRole("button", { name: "메모 추가" }));
    await userEvent.click(screen.getByRole("button", { name: "메모 저장" }));
    const button = await screen.findByRole("button", { name: "저장 중…" });
    await userEvent.click(button);
    expect(post).toHaveBeenCalledTimes(1);
    request.resolve();
    expect(await screen.findByRole("button", { name: "메모 추가" })).toBeTruthy();
  });
});
