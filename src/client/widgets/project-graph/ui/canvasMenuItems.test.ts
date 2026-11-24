import { describe, expect, it, vi } from "vitest";
import { openWindow } from "@/client/shared/lib/openWindow";
import type { WorktreeSummary } from "@/common/board/types";
import type { TemplateRun } from "@/common/templates/types";
import { agentCard } from "../../../../../test/fixtures";
import { EMPTY_CANVAS } from "../model/canvasState";
import { buildGraph, reservedId } from "../model/graph";
import type { MenuItem } from "./CanvasMenu";
import { menuFor, type MenuContext } from "./canvasMenuItems";
import type { MenuTarget } from "./CanvasStage";

vi.mock("@/client/shared/lib/openWindow", () => ({ openWindow: vi.fn() }));

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

const card = (key: string, title: string) => ({ key, title, prompt: `${title} 해줘`, kind: "work" as const, model: null, effort: null, continueFrom: false, pauseAfter: false, check: null });

const run: TemplateRun = {
  id: "r1",
  templateId: "t1",
  name: "기능 흐름",
  cwd: "/p/shop-a",
  intent: "",
  cards: [card("a", "구현"), card("b", "리뷰")],
  routes: [],
  state: "running",
  current: "a",
  sessions: { a: "s1" },
  choice: null,
  trips: {},
  hold: null,
  createdAt: 0,
};

const agents = [
  agentCard({ id: "s1", worktreeId: "/p/shop-a", worktreePath: "/p/shop-a", title: "구현", terminalHandle: "t1", state: "done" }),
  agentCard({ id: "s2", worktreeId: "/p/shop-a", worktreePath: "/p/shop-a", title: "환불", terminalHandle: "t2", state: "done" }),
];
const graph = buildGraph(agents, [worktree("/p/shop", true), worktree("/p/shop-a")], [], [run]);

function context(overrides: Partial<MenuContext> = {}): MenuContext {
  return {
    graph,
    canvas: EMPTY_CANVAS,
    selected: [],
    save: vi.fn(),
    select: vi.fn(),
    onAction: vi.fn(async () => {}),
    onOpenDoc: vi.fn(),
    onOpenWorktree: vi.fn(),
    onConnectFrom: vi.fn(),
    onEditLink: vi.fn(),
    onTidy: vi.fn(),
    onLaunchConductor: vi.fn(),
    onExpandTemplate: vi.fn(),
    onSaveAsTemplate: vi.fn(),
    onEditRun: vi.fn(),
    onEditColors: vi.fn(),
    rest: { restOf: () => null, setRest: vi.fn() },
    ...overrides,
  };
}

const labels = (items: MenuItem[]) => items.map((item) => item.label);

describe("menuFor", () => {
  it("offers a reserved template card its own menu", () => {
    const onEditRun = vi.fn();
    const menu = menuFor({ kind: "node", id: reservedId("r1", "b") }, context({ onEditRun }));
    expect(menu?.title).toBe("예약 카드 · 리뷰");
    const items = menu?.groups.flatMap((group) => group.items) ?? [];
    expect(labels(items)).toContain("흐름 고치기");
    items.find((item) => item.label === "흐름 고치기")?.run();
    expect(onEditRun).toHaveBeenCalledWith(run);
  });

  const targets: Array<[string, MenuTarget, string[]]> = [
    ["a session", { kind: "node", id: "s1" }, []],
    ["a worktree", { kind: "cluster", id: graph.clusters.find((cluster) => !cluster.worktree.isMain)?.id ?? "" }, []],
    ["the selection", { kind: "canvas", id: "" }, ["s1", "s2"]],
    ["a reserved card", { kind: "node", id: reservedId("r1", "b") }, []],
  ];

  it.each(targets)("keeps the destructive items of %s together in the last group", (_, target, selected) => {
    const groups = menuFor(target, context({ selected }))?.groups ?? [];
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
    expect(groups.findIndex((group) => group.items.some((item) => item.danger))).toBe(groups.length - 1);
    expect(groups.at(-1)).toMatchObject({ label: "닫기·지우기" });
    expect(groups.at(-1)?.items.every((item) => item.danger)).toBe(true);
  });

  it("groups a session menu into open, create, state, arrange and close, in that order", () => {
    const groups = menuFor({ kind: "node", id: "s1" }, context())?.groups ?? [];
    expect(groups.map((group) => [group.label, labels(group.items)])).toEqual([
      ["열기", ["패널에서 열기", "새 창에서 열기", "워크트리 열기", "셸 터미널"]],
      ["만들기", ["다른 세션과 잇기"]],
      ["상태 바꾸기", ["쉬는 중으로 바꾸기", "잠자는 중으로 바꾸기"]],
      ["정리", ["그룹으로 묶기", "템플릿으로 저장"]],
      ["닫기·지우기", ["세션 닫기"]],
    ]);
  });

  it("opens a session in its own window", () => {
    const items = menuFor({ kind: "node", id: "s1" }, context())?.groups.flatMap((group) => group.items) ?? [];
    items.find((item) => item.label === "새 창에서 열기")?.run();
    expect(vi.mocked(openWindow)).toHaveBeenCalledWith("/session?id=s1", expect.objectContaining({ width: expect.any(Number) }), expect.stringMatching(/^session-window:/), undefined);
  });

  it("opens a worktree's board in its own window", () => {
    const open = menuFor({ kind: "cluster", id: graph.clusters.find((entry) => entry.worktree.path === "/p/shop-a")!.id }, context())?.groups[0];
    expect(labels(open?.items ?? []).slice(0, 2)).toEqual(["워크트리 열기", "새 창에서 열기"]);
    open?.items[1]?.run();
    expect(vi.mocked(openWindow)).toHaveBeenCalledWith("/?repo=shop&worktree=%2Fp%2Fshop-a", expect.objectContaining({ width: expect.any(Number) }), "board:shop:/p/shop-a");
  });

  // The swatch row on top of the menu paints; its '직접' button opens the full editor.
  const recolor = (target: MenuTarget, overrides: Partial<MenuContext> = {}) => {
    const onEditColors = vi.fn();
    const colors = menuFor(target, context({ onEditColors, ...overrides }))?.colors;
    colors?.custom();
    return { targets: colors?.targets, onEditColors };
  };

  it("paints only the right-clicked session card", () => {
    const { targets, onEditColors } = recolor({ kind: "node", id: "s1" });
    expect(targets).toEqual([{ scope: "card", id: "s1" }]);
    expect(onEditColors).toHaveBeenCalledWith([{ scope: "card", id: "s1" }], "구현");
  });

  it("paints every selected card when the click lands on the selection", () => {
    const { targets, onEditColors } = recolor({ kind: "node", id: "s1" }, { selected: ["s1", "s2"] });
    const both = [
      { scope: "card", id: "s1" },
      { scope: "card", id: "s2" },
    ];
    expect(targets).toEqual(both);
    expect(onEditColors).toHaveBeenCalledWith(both, "고른 세션 2개");
  });

  it("paints a worktree frame, not the sessions inside it", () => {
    const cluster = graph.clusters.find((entry) => entry.worktree.path === "/p/shop-a")!;
    const { targets, onEditColors } = recolor({ kind: "cluster", id: cluster.id });
    expect(targets).toEqual([{ scope: "worktree", id: "/p/shop-a" }]);
    expect(onEditColors).toHaveBeenCalledWith([{ scope: "worktree", id: "/p/shop-a" }], "워크트리 · shop-a");
  });

  it("gives a project frame on the all-projects canvas a menu that paints it", () => {
    expect(recolor({ kind: "project", id: "shop" }).targets).toEqual([{ scope: "project", id: "shop" }]);
  });

  it("offers no colours for a line or the empty canvas", () => {
    expect(menuFor({ kind: "canvas", id: "" }, context())?.colors).toBeUndefined();
  });

  it("no longer hides recolouring in the arrange group", () => {
    const items = menuFor({ kind: "node", id: "s1" }, context())?.groups.flatMap((group) => group.items) ?? [];
    expect(items.some((item) => item.label.includes("색"))).toBe(false);
  });
});
