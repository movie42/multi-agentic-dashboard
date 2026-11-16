import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionRequest } from "@/common/actions/schema";
import { agentCard } from "../../../../../test/fixtures";
import { SessionTabs } from "./SessionTabs";

function setup(focusId: string | null = null) {
  const onAction = vi.fn<(action: ActionRequest) => Promise<void>>(() => Promise.resolve());
  const coordinator = agentCard({ id: "a", terminalHandle: null, prompt: "지휘 세션" });
  const workers = [
    agentCard({ id: "w1", terminalHandle: null, prompt: "E2E 테스트", parentId: "a" }),
    agentCard({ id: "w2", terminalHandle: null, prompt: "코드 리뷰", parentId: "a" }),
  ];
  const solo = agentCard({ id: "b", terminalHandle: null, prompt: "혼자 세션" });
  render(
    <SessionTabs
      worktreeId="wt"
      agents={[coordinator, solo]}
      needsMeIds={new Set()}
      focusId={focusId}
      renderCard={(agent) => <p>card {agent.id}</p>}
      workersOf={(agent) => (agent.id === "a" ? workers : [])}
      onNewSession={() => {}}
      onAction={onAction}
    />,
  );
}

describe("SessionTabs workers", () => {
  beforeEach(() => localStorage.clear());

  it("badges the coordinator tab with its worker count", () => {
    setup();
    expect(screen.getByTitle("하위 세션 2개").textContent).toBe("+2");
  });

  it("opens the worker tabs under the selected coordinator and shows one card at a time", async () => {
    setup();
    const workerTabs = screen.getByRole("tablist", { name: "하위 세션" });
    expect(workerTabs.textContent).toContain("지휘자");
    expect(workerTabs.closest(".sticky")?.contains(screen.getByRole("tablist", { name: "세션" }))).toBe(true);
    expect(screen.getByText("card a")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: /E2E 테스트/ }));
    expect(screen.getByText("card w1")).toBeTruthy();
    expect(screen.queryByText("card a")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: /혼자 세션/ }));
    expect(screen.queryByRole("tablist", { name: "하위 세션" })).toBeNull();
    expect(screen.getByText("card b")).toBeTruthy();
  });

  it("follows a jump to a worker by selecting its coordinator and the worker tab", () => {
    setup("w2");
    expect(screen.getByText("card w2")).toBeTruthy();
  });
});
