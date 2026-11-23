import { describe, expect, it, vi } from "vitest";
import type { WorktreeSummary } from "@/common/board/types";
import type { TemplateRun } from "@/common/templates/types";
import { agentCard } from "../../../../../test/fixtures";
import { EMPTY_CANVAS } from "../model/canvasState";
import { buildGraph, reservedId } from "../model/graph";
import type { MenuItem } from "./CanvasMenu";
import { menuFor, type MenuContext } from "./canvasMenuItems";
import type { MenuTarget } from "./CanvasStage";

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
    const items = menu?.sections.flat() ?? [];
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

  it.each(targets)("keeps the destructive items of %s together in the last section", (_, target, selected) => {
    const sections = menuFor(target, context({ selected }))?.sections ?? [];
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((section) => section.length > 0)).toBe(true);
    const dangerAt = sections.findIndex((section) => section.some((item) => item.danger));
    expect(dangerAt).toBe(sections.length - 1);
    expect(sections.at(-1)?.every((item) => item.danger)).toBe(true);
  });

  it("opens before it creates, and leaves selection and grouping after the session states", () => {
    const sections = menuFor({ kind: "node", id: "s1" }, context())?.sections ?? [];
    expect(sections.map(labels)).toEqual([
      ["패널에서 열기", "워크트리 열기", "셸 터미널"],
      ["다른 세션과 잇기"],
      ["쉬는 중으로 바꾸기", "잠자는 중으로 바꾸기"],
      ["그룹으로 묶기", "템플릿으로 저장"],
      ["세션 닫기"],
    ]);
  });
});
