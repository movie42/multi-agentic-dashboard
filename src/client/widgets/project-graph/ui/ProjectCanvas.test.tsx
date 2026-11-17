import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import type { OrchestrationLink } from "@/common/orchestration/types";
import { agentCard } from "../../../../../test/fixtures";
import { useDocViewerStore } from "@/client/features/view-doc";
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

const conductor = { scope: { kind: "project" as const, root: "/p/shop", paths: [], projects: ["/p/shop"] }, grants: [], rules: [], knownProjects: [], worktreeRequest: null, projectRequest: null };

function renderCanvas(agents: AgentCard[], onAction = vi.fn(async () => {}), elsewhere: { everyAgent?: AgentCard[]; onOpenElsewhere?: (repo: string, worktreeId: string) => void } = {}) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ProjectCanvas
        scope={{ kind: "project", repo: "shop" }}
        worktrees={[worktree("/p/shop", true), worktree("/p/shop-a")]}
        agents={agents}
        everyAgent={elsewhere.everyAgent ?? agents}
        onOpenElsewhere={elsewhere.onOpenElsewhere ?? (() => {})}
        modeOf={() => "personal"}
        now={0}
        header={<h1>shop</h1>}
        renderCard={(agent) => <div data-testid="card">{agent.title}</div>}
        onAction={onAction}
        onOpenWorktree={() => {}}
        renderPanel={(panel) => (
          <div>
            <button type="button" aria-label="오른쪽 패널 접기" onClick={panel.onCollapse} />
            {panel.content}
          </div>
        )}
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

  it("resizes a session box from its corner and keeps the size", () => {
    renderCanvas([agentCard({ id: "s1", worktreeId: "/p/shop-a", worktreeName: "shop-a", title: "결제 API" })]);
    const corner = document.querySelector('[data-resize="s1"]')!;
    fireEvent.pointerDown(corner, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(corner, { button: 0, pointerId: 1, clientX: 120, clientY: 90 });
    fireEvent.pointerUp(corner, { button: 0, pointerId: 1, clientX: 120, clientY: 90 });
    const box = document.querySelector('[data-node="s1"]')!;
    expect(box.getAttribute("width")).toBe("384");
    expect(box.getAttribute("height")).toBe("202");
    expect(JSON.parse(localStorage.getItem("agent-control:canvas:shop")!).sizes.s1).toEqual({ w: 384, h: 202 });
    localStorage.removeItem("agent-control:canvas:shop");
  });

  it("draws every project as a frame on the all-projects canvas", () => {
    const onOpenProject = vi.fn();
    const client = new QueryClient();
    const agents = [
      agentCard({ id: "a", worktreeId: "/p/shop-a", title: "쇼핑 일" }),
      agentCard({ id: "b", repo: "web", worktreeId: "/p/web", title: "웹 일" }),
    ];
    render(
      <QueryClientProvider client={client}>
        <ProjectCanvas
          scope={{ kind: "all" }}
          worktrees={[worktree("/p/shop-a"), { ...worktree("/p/web", true), repo: "web" }]}
          agents={agents}
          everyAgent={agents}
          onOpenElsewhere={() => {}}
          onOpenProject={onOpenProject}
          modeOf={() => "personal"}
          now={0}
          header={null}
          renderCard={() => null}
          onAction={vi.fn(async () => {})}
          onOpenWorktree={() => {}}
          renderPanel={(panel) => panel.content}
        />
      </QueryClientProvider>,
    );
    expect(document.querySelectorAll('[data-drag="project"]')).toHaveLength(2);
    expect(screen.getByText("쇼핑 일")).toBeTruthy();
    expect(screen.getByText("웹 일")).toBeTruthy();
    fireEvent.click(screen.getAllByTitle(/프로젝트 캔버스 열기/)[1]!);
    expect(onOpenProject).toHaveBeenCalledWith("web");
  });

  it("opens a folded side panel when a box is double-clicked", () => {
    localStorage.setItem("agent-control:canvas-panel", JSON.stringify(["collapsed"]));
    renderCanvas([agentCard({ id: "s1", worktreeId: "/p/shop-a", worktreeName: "shop-a", title: "결제 API" })]);
    expect(screen.queryByTestId("card")).toBeNull();
    const box = screen.getByText("결제 API");
    for (let i = 0; i < 2; i += 1) {
      fireEvent.pointerDown(box, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerUp(box, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    }
    expect(screen.getByTestId("card").textContent).toBe("결제 API");
    localStorage.removeItem("agent-control:canvas-panel");
  });

  it("starts a worktree conductor on the canvas without leaving it", () => {
    const onOpenWorktree = vi.fn();
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ProjectCanvas scope={{ kind: "project", repo: "shop" }} worktrees={[worktree("/p/shop", true), worktree("/p/shop-a")]} agents={[]} everyAgent={[]} onOpenElsewhere={() => {}} modeOf={() => "personal"} now={0} header={null} renderCard={() => null} onAction={vi.fn(async () => {})} onOpenWorktree={onOpenWorktree} renderPanel={(panel) => panel.content} />
      </QueryClientProvider>,
    );
    fireEvent.contextMenu(document.querySelectorAll("[data-cluster]")[1]!, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "지휘자" }));
    expect(screen.getByText(/이 워크트리와 하위 워크트리/)).toBeTruthy();
    expect(onOpenWorktree).not.toHaveBeenCalled();
  });

  it("draws a conductor from outside the project on top, and routes to other projects' worktrees both ways", () => {
    const appConductor = { ...conductor, scope: { kind: "app" as const, root: "/data/conductor", paths: [], projects: ["/p/shop", "/p/web"] } };
    const onOpenElsewhere = vi.fn();
    const here = [
      agentCard({ id: "w", worktreeId: "/p/shop-a", title: "일꾼", orchestration: { conductor: null, parentId: "app", links: [link("report", "w", "app")] } }),
      agentCard({ id: "c", worktreeId: "/p/shop", title: "코디네이터", orchestration: { conductor, parentId: null, links: [link("delegate", "c", "x")] } }),
    ];
    const everyAgent = [
      ...here,
      agentCard({ id: "app", repo: "", worktreeId: "/data/conductor", title: "앱 코디", orchestration: { conductor: appConductor, parentId: null, links: [link("delegate", "app", "w")] } }),
      agentCard({ id: "x", repo: "web", worktreeId: "/p/web", title: "웹 일꾼" }),
    ];
    renderCanvas(here, undefined, { everyAgent, onOpenElsewhere });
    expect(screen.getByText("앱 지휘자 ·")).toBeTruthy();
    expect(screen.getByText("앱 코디")).toBeTruthy();
    expect(screen.queryByText("웹 일꾼")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "일꾼 1" }));
    expect(onOpenElsewhere).toHaveBeenCalledWith("web", "/p/web");
  });

  it("draws a port back to the worktree an outside project conductor runs in", () => {
    const onOpenElsewhere = vi.fn();
    const home = { ...conductor, scope: { ...conductor.scope, root: "/p/back", projects: ["/p/back", "/p/shop"] } };
    const here = [agentCard({ id: "w", worktreeId: "/p/shop-a", title: "일꾼", orchestration: { conductor: null, parentId: "bc", links: [link("report", "w", "bc")] } })];
    const everyAgent = [
      ...here,
      agentCard({ id: "bc", repo: "back", worktreeId: "/p/back", worktreeName: "main", title: "백오피스 코디", orchestration: { conductor: home, parentId: null, links: [link("delegate", "bc", "w")] } }),
    ];
    renderCanvas(here, undefined, { everyAgent, onOpenElsewhere });
    fireEvent.click(document.querySelector("[data-port] button")!);
    expect(onOpenElsewhere).toHaveBeenCalledWith("back", "/p/back");
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

  it("lists a worktree's flow pages and session documents and opens the picked one in the panel", () => {
    const doc = "/p/shop-a/docs/shop/pay/03-tasks.html";
    const flowPage = "/p/shop-a/docs/shop/pay/index.html";
    const client = new QueryClient();
    const shopA = { ...worktree("/p/shop-a"), flowTasks: [{ taskId: "pay", title: "결제", domain: "shop", pageIndex: flowPage } as WorktreeSummary["flowTasks"][number]] };
    const onAction = vi.fn(async () => {});
    render(
      <QueryClientProvider client={client}>
        <ProjectCanvas
          scope={{ kind: "project", repo: "shop" }}
          worktrees={[worktree("/p/shop", true), shopA]}
          agents={[
            agentCard({ id: "s1", worktreeId: "/p/shop-a", title: "결제 API", artifacts: [{ target: doc, label: "pay · 03-tasks", kind: "html" }] }),
            agentCard({ id: "s2", worktreeId: "/p/shop-a", title: "환불", artifacts: [{ target: doc, label: "pay · 03-tasks", kind: "html" }, { target: "https://x/pr/1", label: "#1", kind: "pr" }] }),
          ]}
          everyAgent={[]}
          onOpenElsewhere={() => {}}
          modeOf={() => "personal"}
          now={0}
          header={null}
          renderCard={() => null}
          onAction={onAction}
          onOpenWorktree={() => {}}
          renderPanel={(panel) => panel.content}
        />
      </QueryClientProvider>,
    );
    fireEvent.contextMenu(document.querySelectorAll("[data-cluster]")[1]!, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "문서 열기 (2)" }));
    expect(screen.getByRole("menuitem", { name: /결제\s*flow · pay/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /pay · 03-tasks/ }));
    expect(useDocViewerStore.getState().active).toBe(doc);
    expect(onAction).not.toHaveBeenCalled();
    useDocViewerStore.getState().closeAll();
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
