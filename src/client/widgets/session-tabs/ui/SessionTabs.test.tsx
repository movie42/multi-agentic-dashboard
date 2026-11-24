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

function setupAreas(areas: unknown[] | null = null) {
  if (areas) localStorage.setItem("agent-control:session-areas:wt", JSON.stringify(areas));
  render(
    <SessionTabs
      worktreeId="wt"
      agents={[
        agentCard({ id: "a", terminalHandle: null, prompt: "지금 세션" }),
        agentCard({ id: "b", terminalHandle: null, prompt: "미룬 세션" }),
      ]}
      needsMeIds={new Set()}
      focusId={null}
      renderCard={(agent) => <p>card {agent.id}</p>}
      onNewSession={() => {}}
      onAction={() => Promise.resolve()}
    />,
  );
}

const savedAreas = () => JSON.parse(localStorage.getItem("agent-control:session-areas:wt") ?? "[]") as Array<{ name: string; memberIds: string[] }>;

describe("SessionTabs areas", () => {
  beforeEach(() => localStorage.clear());

  it("shows sessions in no area first, then each area's header followed by its tabs", () => {
    setupAreas([{ id: "later", name: "나중에 볼 일", memberIds: ["b"] }]);
    const strip = screen.getByRole("tablist", { name: "세션" });
    const order = [...strip.querySelectorAll("[data-session-tab], [data-area-header]")].map((element) => element.textContent);
    expect(order).toEqual([expect.stringContaining("지금 세션"), expect.stringContaining("나중에 볼 일"), expect.stringContaining("미룬 세션")]);
  });

  it("folds an area's tabs away when its header is clicked", async () => {
    setupAreas([{ id: "later", name: "나중에 볼 일", memberIds: ["b"] }]);
    await userEvent.click(screen.getByRole("button", { name: /나중에 볼 일/ }));
    expect(screen.queryByRole("tab", { name: /미룬 세션/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /지금 세션/ })).toBeTruthy();
  });

  it("moves a tab into a new area named by the person from the tab's menu", async () => {
    setupAreas();
    await userEvent.pointer({ keys: "[MouseRight]", target: screen.getByRole("tab", { name: /지금 세션/ }) });
    await userEvent.click(screen.getByRole("menuitem", { name: /새 영역/ }));
    const input = screen.getByRole("textbox", { name: "영역 이름" });
    await userEvent.clear(input);
    await userEvent.type(input, "하고 있는 일{Enter}");
    expect(screen.getByRole("button", { name: /하고 있는 일/ })).toBeTruthy();
    expect(savedAreas()).toEqual([expect.objectContaining({ name: "하고 있는 일", memberIds: ["a"] })]);
  });

  it("takes a tab out of its area and keeps the emptied area", async () => {
    setupAreas([{ id: "later", name: "나중에 볼 일", memberIds: ["b"] }]);
    await userEvent.pointer({ keys: "[MouseRight]", target: screen.getByRole("tab", { name: /미룬 세션/ }) });
    await userEvent.click(screen.getByRole("menuitem", { name: /영역에서 빼기/ }));
    expect(savedAreas()).toEqual([expect.objectContaining({ name: "나중에 볼 일", memberIds: [] })]);
  });

  it("moves a tab into an existing area from its menu", async () => {
    setupAreas([{ id: "later", name: "나중에 볼 일", memberIds: [] }]);
    await userEvent.pointer({ keys: "[MouseRight]", target: screen.getByRole("tab", { name: /지금 세션/ }) });
    await userEvent.click(screen.getByRole("menuitem", { name: /나중에 볼 일/ }));
    expect(savedAreas()[0]?.memberIds).toEqual(["a"]);
  });

  it("removes an area from its header menu, handing its tabs back", async () => {
    setupAreas([{ id: "later", name: "나중에 볼 일", memberIds: ["b"] }]);
    await userEvent.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: /나중에 볼 일/ }) });
    await userEvent.click(screen.getByRole("menuitem", { name: /영역 지우기/ }));
    expect(savedAreas()).toEqual([]);
    expect(screen.getByRole("tab", { name: /미룬 세션/ })).toBeTruthy();
  });

  it("keeps the old name when typing a new one is given up with Escape", async () => {
    setupAreas([{ id: "later", name: "나중에 볼 일", memberIds: [] }]);
    await userEvent.dblClick(screen.getByRole("button", { name: /나중에 볼 일/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "영역 이름" }), "반쯤{Escape}");
    expect(savedAreas()[0]?.name).toBe("나중에 볼 일");
    expect(screen.queryByRole("textbox", { name: "영역 이름" })).toBeNull();
  });

  it("adds an empty area from the strip's button", async () => {
    setupAreas();
    await userEvent.click(screen.getByRole("button", { name: "영역 추가" }));
    await userEvent.type(screen.getByRole("textbox", { name: "영역 이름" }), "{Enter}");
    expect(savedAreas()).toEqual([expect.objectContaining({ name: "새 영역", memberIds: [] })]);
  });
});
