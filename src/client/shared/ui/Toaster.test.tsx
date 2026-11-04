import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOAST_LIMIT, toastError, useToastStore } from "../model/toastStore";
import { StatusLine } from "./StatusLine";
import { Toaster } from "./Toaster";

afterEach(() => {
  useToastStore.setState({ toasts: [] });
  vi.useRealTimers();
});

describe("Toaster", () => {
  it("shows an action failure with its cause and logs it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Toaster />);
    act(() => toastError("send-prompt", new Error("터미널을 찾을 수 없어요")));
    expect(screen.getByRole("alert").textContent).toContain("터미널을 찾을 수 없어요");
    expect(error).toHaveBeenCalledWith("[send-prompt]", "터미널을 찾을 수 없어요", {}, expect.any(Error));
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dismisses itself and keeps only the latest toasts", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      for (const index of Array.from({ length: TOAST_LIMIT + 2 }, (_, i) => i)) useToastStore.getState().show(`t${index}`);
    });
    expect(screen.getAllByRole("status")).toHaveLength(TOAST_LIMIT);
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });
});

describe("StatusLine", () => {
  it("renders nothing without an error and the cause with one", () => {
    const { rerender, container } = render(<StatusLine error={null} label="보드 갱신 실패" />);
    expect(container.textContent).toBe("");
    rerender(<StatusLine error={new Error("orca 응답 없음")} label="보드 갱신 실패" />);
    expect(screen.getByRole("status").textContent).toBe("보드 갱신 실패orca 응답 없음");
  });
});
