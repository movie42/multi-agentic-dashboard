import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingPermission } from "@/common/permissions/types";
import { postAction } from "@/client/shared/api/actions";
import { useToastStore } from "@/client/shared/model/toastStore";
import { PermissionPanel } from "./PermissionPanel";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));

const post = vi.mocked(postAction);

const permission: PendingPermission = {
  id: "req-1",
  paneKey: "pane",
  receivedAt: 0,
  toolName: "Bash",
  toolInput: { command: "rm -rf dist" },
  suggestions: [],
  transcriptPath: "",
};

beforeEach(() => {
  post.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe("PermissionPanel", () => {
  it("sends the answer and locks the buttons once sent", async () => {
    post.mockResolvedValue();
    render(<PermissionPanel permission={permission} />);
    await userEvent.click(screen.getByRole("button", { name: "허용" }));
    expect(post).toHaveBeenCalledWith({ type: "answer-permission", requestId: "req-1", answer: { behavior: "allow", suggestionIndex: null } });
    expect(await screen.findByText("보냈어요. 상태가 곧 바뀌어요.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "허용" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the failure inline and as a toast, and allows a retry", async () => {
    post.mockRejectedValueOnce(new Error("요청이 만료됐어요")).mockResolvedValueOnce();
    render(<PermissionPanel permission={permission} />);
    await userEvent.click(screen.getByRole("button", { name: "허용" }));
    expect(await screen.findByText("못 보냈어요: 요청이 만료됐어요")).toBeTruthy();
    expect(useToastStore.getState().toasts).toMatchObject([{ tone: "error", message: "요청이 만료됐어요" }]);
    expect(console.error).toHaveBeenCalledWith("[permission]", "요청이 만료됐어요", {}, expect.any(Error));
    await userEvent.click(screen.getByRole("button", { name: "허용" }));
    expect(await screen.findByText("보냈어요. 상태가 곧 바뀌어요.")).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("ignores a second click while the answer is in flight", async () => {
    const request = Promise.withResolvers<void>();
    post.mockReturnValue(request.promise);
    render(<PermissionPanel permission={permission} />);
    const allow = screen.getByRole("button", { name: "허용" });
    await userEvent.click(allow);
    expect((allow as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(allow);
    expect(post).toHaveBeenCalledTimes(1);
    request.resolve();
    expect(await screen.findByText("보냈어요. 상태가 곧 바뀌어요.")).toBeTruthy();
  });
});
