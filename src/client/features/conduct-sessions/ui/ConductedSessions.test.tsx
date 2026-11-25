import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentCard } from "../../../../../test/fixtures";
import { ConductedSessions } from "./ConductedSessions";

const requestDock = vi.hoisted(() => vi.fn());
vi.mock("@/client/entities/agent", async (importOriginal) => ({ ...(await importOriginal<object>()), requestDock }));

describe("ConductedSessions", () => {
  beforeEach(() => requestDock.mockReset());

  it("lists the sessions a conductor conducts with their project and worktree, and opens one on click", async () => {
    const workers = [
      agentCard({ id: "w1", repo: "web", worktreeName: "COMP-659", title: "보안 패치 확인", state: "working" }),
      agentCard({ id: "w2", repo: "app", worktreeName: "COMP-660", title: "PR 정리", state: "done" }),
    ];
    render(<ConductedSessions workers={workers} />);
    expect(screen.getByText("지휘하는 세션 2")).toBeTruthy();
    expect(screen.getByText("web · COMP-659")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /PR 정리/ }));
    expect(requestDock).toHaveBeenCalledWith("w2");
  });

  it("shows nothing when the conductor conducts no session", () => {
    const { container } = render(<ConductedSessions workers={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
