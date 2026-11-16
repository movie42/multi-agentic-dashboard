import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import type { OrchestrationLink } from "@/common/orchestration/types";
import { agentCard } from "../../../../../test/fixtures";
import { ProjectCanvas } from "./ProjectCanvas";

function worktree(path: string, isMain = false): WorktreeSummary {
  return {
    worktreeId: path,
    repo: "shop",
    name: path.split("/").pop() ?? path,
    branch: null,
    path,
    projectPath: "/p/shop",
    isMain,
    parentWorktreeId: null,
    unread: false,
    lastActivityAt: null,
    flowTasks: [],
    otherFlowTasks: [],
    pullRequest: { kind: "none" },
    jira: { kind: "not-applicable" },
    featureId: null,
  };
}

const link = (kind: OrchestrationLink["kind"], from: string, to: string): OrchestrationLink => ({
  id: `${kind}-${from}-${to}`,
  kind,
  from,
  to,
  prompt: null,
  trips: 0,
  paused: false,
  createdAt: 0,
});

const conductor = { scope: { kind: "project" as const, root: "/p/shop", paths: ["/p/shop", "/p/shop-a"] }, grants: [], rules: [], worktreeRequest: null };

function renderCanvas(agents: AgentCard[], onAction = vi.fn(async () => {})) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ProjectCanvas
        repo="shop"
        worktrees={[worktree("/p/shop", true), worktree("/p/shop-a")]}
        agents={agents}
        mode="personal"
        now={0}
        header={<h1>shop</h1>}
        renderCard={(agent) => <div data-testid="card">{agent.title}</div>}
        onAction={onAction}
        onOpenWorktree={() => {}}
      />
    </QueryClientProvider>,
  );
  return onAction;
}

beforeAll(() => {
  Element.prototype.setPointerCapture = () => {};
});

describe("ProjectCanvas", () => {
  it("opens without a conductor and shows every worktree frame", () => {
    renderCanvas([agentCard({ id: "s1", worktreeId: "/p/shop-a", worktreeName: "shop-a", title: "결제 API" })]);
    expect(screen.getByText("결제 API")).toBeTruthy();
    expect(screen.getAllByText("워크트리 열기")).toHaveLength(2);
    expect(screen.getByText("상자를 누르면 여기서 답할 수 있어요.")).toBeTruthy();
  });

  it("draws the conductor on top with its lines, and answers a clicked box in the side panel", () => {
    renderCanvas([
      agentCard({ id: "c", worktreeId: "/p/shop", title: "코디네이터", orchestration: { conductor, parentId: null, links: [link("delegate", "c", "w")] } }),
      agentCard({ id: "w", worktreeId: "/p/shop-a", worktreeName: "shop-a", title: "일꾼", orchestration: { conductor: null, parentId: "c", links: [link("report", "w", "c")] } }),
    ]);
    expect(screen.getByText(/지휘자 · 프로젝트/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "맡김" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "보고" })).toBeTruthy();

    const box = screen.getByText("일꾼");
    fireEvent.pointerDown(box, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(box, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    expect(screen.getByTestId("card").textContent).toBe("일꾼");
  });

  it("unlinks a line from the side panel", () => {
    const onAction = renderCanvas([
      agentCard({ id: "a", worktreeId: "/p/shop-a", title: "앞", orchestration: { conductor: null, parentId: null, links: [link("next", "a", "b")] } }),
      agentCard({ id: "b", worktreeId: "/p/shop-a", title: "뒤" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "끝나면" }));
    fireEvent.click(screen.getByRole("button", { name: "끊기" }));
    expect(onAction).toHaveBeenCalledWith({ type: "unlink-sessions", linkId: "next-a-b" });
  });

  it("closes a session from the right-click menu only after a second press", () => {
    const onAction = renderCanvas([agentCard({ id: "s1", worktreeId: "/p/shop-a", title: "결제 API", terminalHandle: "t1" })]);
    fireEvent.contextMenu(screen.getByText("결제 API"));
    fireEvent.click(screen.getByRole("menuitem", { name: "세션 닫기" }));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "한 번 더 누르면 닫아요" }));
    expect(onAction).toHaveBeenCalledWith({ type: "close-terminals", terminalHandles: ["t1"] });
  });

  it("folds the side panel away and back", () => {
    renderCanvas([agentCard({ id: "s1", worktreeId: "/p/shop-a", title: "결제 API" })]);
    fireEvent.click(screen.getByRole("button", { name: "오른쪽 패널 접기" }));
    expect(screen.queryByText("상자를 누르면 여기서 답할 수 있어요.")).toBeNull();
    fireEvent.click(screen.getByTitle("오른쪽 패널 펼치기"));
    expect(screen.getByText("상자를 누르면 여기서 답할 수 있어요.")).toBeTruthy();
  });

  it("closes every selected session at once from the right-click menu", () => {
    const onAction = renderCanvas([
      agentCard({ id: "a", worktreeId: "/p/shop-a", title: "첫째", terminalHandle: "ta" }),
      agentCard({ id: "b", worktreeId: "/p/shop-a", title: "둘째", terminalHandle: "tb" }),
      agentCard({ id: "c", worktreeId: "/p/shop-a", title: "셋째", terminalHandle: "tc" }),
    ]);
    const click = (text: string, shiftKey: boolean) => {
      const box = screen.getByText(text);
      fireEvent.pointerDown(box, { button: 0, pointerId: 1, shiftKey });
      fireEvent.pointerUp(box, { button: 0, pointerId: 1, shiftKey });
    };
    click("첫째", false);
    click("둘째", true);
    fireEvent.contextMenu(screen.getByText("둘째"));
    expect(screen.getByText("고른 세션 2개")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "세션 2개 닫기 (2개)" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "한 번 더 누르면 2개를 닫아요" }));
    expect(onAction).toHaveBeenCalledWith({ type: "close-terminals", terminalHandles: ["ta", "tb"] });
  });

  it("acts on a box outside the selection by itself", () => {
    renderCanvas([
      agentCard({ id: "a", worktreeId: "/p/shop-a", title: "첫째", terminalHandle: "ta" }),
      agentCard({ id: "b", worktreeId: "/p/shop-a", title: "둘째", terminalHandle: "tb" }),
    ]);
    const box = screen.getByText("첫째");
    fireEvent.pointerDown(box, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(box, { button: 0, pointerId: 1 });
    fireEvent.contextMenu(screen.getByText("둘째"));
    expect(screen.getByRole("menuitem", { name: "세션 닫기" })).toBeTruthy();
  });
  it("shows a renamed session's title on its box", () => {
    renderCanvas([
      agentCard({ id: "a", worktreeId: "/p/shop-a", title: null, prompt: "원래 요청", session: { id: "s-a", title: "새 이름", titleSource: "custom", bookmark: null } }),
    ]);
    expect(screen.getByText("새 이름")).toBeTruthy();
    expect(screen.queryByText("원래 요청")).toBeNull();
  });

  it("switches between the edit and hand tools with V and H", () => {
    renderCanvas([agentCard({ id: "a", worktreeId: "/p/shop-a", title: "첫째" })]);
    expect(screen.getByRole("radio", { name: "편집" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(window, { code: "KeyH", key: "h" });
    expect(screen.getByRole("radio", { name: "이동" }).getAttribute("aria-checked")).toBe("true");
    const box = screen.getByText("첫째");
    fireEvent.pointerDown(box, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(box, { button: 0, pointerId: 1 });
    expect(screen.getByTestId("card")).toBeTruthy();
    fireEvent.keyDown(window, { code: "KeyV", key: "v" });
    expect(screen.getByRole("radio", { name: "편집" }).getAttribute("aria-checked")).toBe("true");
  });
  it("moves a selected line's end onto another box", async () => {
    const onAction = renderCanvas([
      agentCard({ id: "a", worktreeId: "/p/shop-a", title: "앞", orchestration: { conductor: null, parentId: null, links: [link("next", "a", "b")] } }),
      agentCard({ id: "b", worktreeId: "/p/shop-a", title: "뒤" }),
      agentCard({ id: "c", worktreeId: "/p/shop-a", title: "다른" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "끝나면" }));
    const handle = document.querySelector("[data-end='to']");
    expect(handle).toBeTruthy();
    const target = screen.getByText("다른");
    document.elementFromPoint = () => target;
    fireEvent.pointerDown(handle!, { button: 0, pointerId: 1 });
    fireEvent.pointerMove(handle!, { button: 0, pointerId: 1, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(handle!, { button: 0, pointerId: 1, clientX: 40, clientY: 40 });
    await vi.waitFor(() => expect(onAction).toHaveBeenCalledWith({ type: "unlink-sessions", linkId: "next-a-b" }));
    expect(onAction).toHaveBeenCalledWith({ type: "connect-sessions", from: "a", to: "c", kind: "next", prompt: null });
  });
  it("shows running subagents on the box", () => {
    renderCanvas([
      agentCard({ id: "a", worktreeId: "/p/shop-a", title: "리뷰", subagents: [{ id: "x", description: "Review the diff", agentType: "fork", activity: "Bash · git diff", updatedAt: 0 }] }),
    ]);
    expect(screen.getByText("서브 에이전트 1")).toBeTruthy();
    expect(screen.getByText("Bash · git diff")).toBeTruthy();
  });
});
