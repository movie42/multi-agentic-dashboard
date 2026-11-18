import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStoredListStore } from "@/client/shared/lib/storedListStore";
import type { ActionRequest } from "@/common/actions/schema";
import { agentCard } from "../../../../../test/fixtures";
import { AgentList } from "./AgentList";
import { useRowSelection } from "../model/rowSelection";

vi.mock("@/client/features/bookmark-session", () => ({ BookmarkMark: () => null, bookmarkTarget: () => null }));

function setup() {
  const onAction = vi.fn<(action: ActionRequest) => Promise<void>>(() => Promise.resolve());
  const coordinator = agentCard({ id: "a", terminalHandle: "term-a", prompt: "첫 세션" });
  const worker = agentCard({ id: "w", terminalHandle: "term-w", parentId: "a" });
  const idle = agentCard({ id: "b", terminalHandle: null, prompt: "닫힌 세션" });
  render(
    <AgentList
      agents={[coordinator, idle]}
      now={0}
      showRepo={false}
      renderCard={(agent) => <p>card {agent.id}</p>}
      workersOf={(agent) => (agent.id === "a" ? [worker] : [])}
      onAction={onAction}
    />,
  );
  return { onAction };
}

const openMenuOn = (text: string) => fireEvent.contextMenu(screen.getByText(text), { clientX: 10, clientY: 10 });

describe("AgentList context menu", () => {
  it("closes the right-clicked session without a confirm step", async () => {
    const { onAction } = setup();
    openMenuOn("첫 세션");
    await userEvent.click(screen.getByRole("menuitem", { name: "세션 닫기" }));
    expect(onAction).toHaveBeenCalledWith({ type: "close-terminal", terminalHandle: "term-a" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes every open terminal in the list, workers included, after one confirm", async () => {
    const { onAction } = setup();
    openMenuOn("닫힌 세션");
    expect(screen.queryByRole("menuitem", { name: "세션 닫기" })).toBeNull();
    await userEvent.click(screen.getByRole("menuitem", { name: /이 목록 세션 모두 닫기/ }));
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("menuitem", { name: "모두 닫기" }));
    expect(onAction).toHaveBeenCalledWith({ type: "close-terminals", terminalHandles: ["term-a", "term-w"] });
  });

  it("expands the row from the menu and closes on Escape", async () => {
    setup();
    openMenuOn("첫 세션");
    await userEvent.click(screen.getByRole("menuitem", { name: "펼치기" }));
    expect(screen.getByText("card a")).toBeTruthy();
    openMenuOn("첫 세션");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("AgentList rest marks", () => {
  function setupPickable() {
    const agents = [
      agentCard({ id: "p", state: "done", stateSince: 1, prompt: "첫째" }),
      agentCard({ id: "q", state: "blocked", stateSince: 2, prompt: "둘째" }),
      agentCard({ id: "r", state: "working", stateSince: 3, prompt: "셋째" }),
    ];
    render(<AgentList agents={agents} now={0} showRepo={false} renderCard={() => null} selectionPool={agents} />);
  }

  beforeEach(() => {
    window.localStorage.clear();
    useStoredListStore.setState({ lists: {} });
    useRowSelection.setState({ ids: [] });
  });

  it("puts one session to 쉬는 중 from its own menu and back", async () => {
    setupPickable();
    openMenuOn("첫째");
    await userEvent.click(screen.getByRole("menuitem", { name: "쉬는 중으로 바꾸기" }));
    expect(screen.getAllByText("쉬는 중")).toHaveLength(1);
    openMenuOn("첫째");
    await userEvent.click(screen.getByRole("menuitem", { name: "원래 상태로 되돌리기" }));
    expect(screen.queryByText("쉬는 중")).toBeNull();
  });

  it("marks every ⌘-picked session 잠자는 중 at once, skipping a working one", async () => {
    setupPickable();
    fireEvent.click(screen.getByText("첫째"), { metaKey: true });
    fireEvent.click(screen.getByText("둘째"), { shiftKey: true });
    fireEvent.click(screen.getByText("셋째"), { metaKey: true });
    openMenuOn("둘째");
    expect(screen.getByText("고른 세션 3개")).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: /잠자는 중으로 바꾸기/ }));
    expect(screen.getAllByText("잠자는 중")).toHaveLength(2);
    expect(screen.getByText("에이전트 작업 중")).toBeTruthy();
    expect(useRowSelection.getState().ids).toEqual([]);
  });
});
