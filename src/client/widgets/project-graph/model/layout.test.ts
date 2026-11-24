import { describe, expect, it } from "vitest";
import type { WorktreeSummary } from "@/common/board/types";
import type { OrchestrationLink, SessionOrchestration } from "@/common/orchestration/types";
import { agentCard } from "../../../../../test/fixtures";
import { buildGraph, clusterId } from "./graph";
import { AREA_HEAD, areaKey, areaRect, autoLayout, chainColumns, clusterRect, edgeGeometry, NODE_H, NODE_W, nearestSide, sharedLanes } from "./layout";
import { EMPTY_CANVAS, parseCanvasState, pruneCanvas, groupsToAreas, resetPositions, resolveLayout, resolvePositions, setEdgeEnd } from "./canvasState";

function worktree(path: string, overrides: Partial<WorktreeSummary> = {}): WorktreeSummary {
  return {
    worktreeId: path,
    repo: "shop",
    name: path.split("/").pop() ?? path,
    branch: null,
    path,
    projectPath: "/p/shop",
    isMain: path === "/p/shop",
    parentWorktreeId: null,
    unread: false,
    lastActivityAt: null,
    flowTasks: [],
    otherFlowTasks: [],
    pullRequest: { kind: "none" },
    jira: { kind: "not-applicable" },
    featureId: null,
    ...overrides,
  };
}

function link(kind: OrchestrationLink["kind"], from: string, to: string): OrchestrationLink {
  return { id: `${kind}-${from}-${to}`, kind, from, to, prompt: null, trips: 0, paused: false, createdAt: 0 };
}

function orchestration(overrides: Partial<SessionOrchestration>): SessionOrchestration {
  return { conductor: null, parentId: null, links: [], ...overrides };
}

const conductor = {
  scope: { kind: "project" as const, root: "/p/shop", paths: [], projects: ["/p/shop"] },
  grants: [],
  rules: [],
  knownProjects: [],
  worktreeRequest: null,
  projectRequest: null,
};

describe("buildGraph", () => {
  it("opens without a conductor: every session stays in its worktree cluster", () => {
    const graph = buildGraph(
      [agentCard({ id: "s1", worktreeId: "/p/shop-a" }), agentCard({ id: "s2", worktreeId: "/p/shop-b" })],
      [worktree("/p/shop-a"), worktree("/p/shop-b")],
      [],
    );
    expect(graph.conductors).toEqual([]);
    expect(graph.clusters.map((cluster) => cluster.nodeIds)).toEqual([["s1"], ["s2"]]);
    expect(graph.edges).toEqual([]);
  });

  it("lifts conductors out of their worktree and keeps lines whose both ends are on the board", () => {
    const graph = buildGraph(
      [
        agentCard({ id: "c", worktreeId: "/p/shop", orchestration: orchestration({ conductor, links: [link("delegate", "c", "w"), link("delegate", "c", "gone")] }) }),
        agentCard({ id: "w", worktreeId: "/p/shop-a", orchestration: orchestration({ parentId: "c", links: [link("report", "w", "c")] }) }),
      ],
      [worktree("/p/shop"), worktree("/p/shop-a")],
      [],
    );
    expect(graph.conductors.map((node) => node.id)).toEqual(["c"]);
    expect(graph.clusters[0]?.nodeIds).toEqual([]);
    expect(graph.edges.map((edge) => edge.kind)).toEqual(["delegate", "report"]);
  });

  it("draws fork lines between clusters and overlap lines with their files", () => {
    const graph = buildGraph(
      [],
      [worktree("/p/shop-a"), worktree("/p/shop-b", { parentWorktreeId: "/p/shop-a" })],
      [{ a: "/p/shop-a", b: "/p/shop-b", files: ["x.ts"] }, { a: "/p/shop-a", b: "/p/elsewhere", files: ["y.ts"] }],
    );
    expect(graph.edges).toMatchObject([
      { kind: "fork", from: clusterId("/p/shop-a"), to: clusterId("/p/shop-b") },
      { kind: "overlap", files: ["x.ts"] },
    ]);
  });
});

describe("autoLayout", () => {
  it("stacks a next chain in one column and puts unchained sessions beside it", () => {
    const agents = [
      agentCard({ id: "a", worktreeId: "/p/shop-a", orchestration: orchestration({ links: [link("next", "a", "b")] }) }),
      agentCard({ id: "b", worktreeId: "/p/shop-a" }),
      agentCard({ id: "c", worktreeId: "/p/shop-a" }),
    ];
    const graph = buildGraph(agents, [worktree("/p/shop-a")], []);
    const cluster = graph.clusters[0]!;
    expect(chainColumns(cluster, graph)).toEqual([["a", "b"], ["c"]]);
    const { positions } = autoLayout(graph);
    expect(positions.get("b")!.x).toBe(positions.get("a")!.x);
    expect(positions.get("b")!.y).toBeGreaterThan(positions.get("a")!.y);
    expect(positions.get("c")!.y).toBe(positions.get("a")!.y);
  });

  it("wraps many unchained sessions into three columns", () => {
    const agents = Array.from({ length: 7 }, (_, index) => agentCard({ id: `s${index}`, worktreeId: "/p/shop-a" }));
    const graph = buildGraph(agents, [worktree("/p/shop-a")], []);
    expect(chainColumns(graph.clusters[0]!, graph).map((column) => column.length)).toEqual([3, 2, 2]);
  });

  it("survives a cycle of next lines", () => {
    const agents = [
      agentCard({ id: "a", worktreeId: "/p/shop-a", orchestration: orchestration({ links: [link("next", "a", "b")] }) }),
      agentCard({ id: "b", worktreeId: "/p/shop-a", orchestration: orchestration({ links: [link("next", "b", "a")] }) }),
    ];
    const graph = buildGraph(agents, [worktree("/p/shop-a")], []);
    expect(chainColumns(graph.clusters[0]!, graph).flat().sort()).toEqual(["a", "b"]);
  });

  it("puts conductors above every cluster", () => {
    const agents = [
      agentCard({ id: "c", worktreeId: "/p/shop", orchestration: orchestration({ conductor }) }),
      agentCard({ id: "w", worktreeId: "/p/shop-a" }),
    ];
    const { positions } = autoLayout(buildGraph(agents, [worktree("/p/shop"), worktree("/p/shop-a")], []));
    expect(positions.get("c")!.y + NODE_H).toBeLessThan(positions.get("w")!.y);
  });

  it("keeps a resized box's size and pushes its neighbours down", () => {
    const graph = buildGraph(
      [agentCard({ id: "s1", worktreeId: "/p/shop-a" }), agentCard({ id: "s2", worktreeId: "/p/shop-a" }), agentCard({ id: "s3", worktreeId: "/p/shop-a" }), agentCard({ id: "s4", worktreeId: "/p/shop-a" })],
      [worktree("/p/shop-a")],
      [],
    );
    const sizes = { s1: { w: 400, h: 300 } };
    const { positions } = autoLayout(graph, { sizes });
    const s1 = positions.get("s1")!;
    const s4 = positions.get("s4")!;
    expect(s4.x).toBe(s1.x);
    expect(s4.y).toBeGreaterThanOrEqual(s1.y + 300);
    expect(positions.get("s2")!.x).toBeGreaterThanOrEqual(s1.x + 400);
  });

  it("never draws a resized worktree frame smaller than it was resized to", () => {
    const anchor = { x: 10, y: 20 };
    const rect = clusterRect("wt:a", ["s"], new Map([["s", { x: 40, y: 70 }]]), anchor, { "wt:a": { w: 900, h: 500 } });
    expect(rect).toEqual({ x: 10, y: 20, w: 900, h: 500 });
  });

  it("lays out every project as its own block of worktrees", () => {
    const graph = buildGraph(
      [agentCard({ id: "a", worktreeId: "/p/shop-a" }), agentCard({ id: "b", repo: "web", worktreeId: "/p/web" })],
      [worktree("/p/shop-a"), worktree("/p/web", { repo: "web", projectPath: "/p/web" })],
      [],
    );
    const { anchors } = autoLayout(graph, { byProject: true });
    const shop = anchors.get(clusterId("/p/shop-a"))!;
    const web = anchors.get(clusterId("/p/web"))!;
    expect(shop.y).toBe(web.y);
    expect(web.x).toBeGreaterThan(shop.x + NODE_W);
  });

  it("gives an empty cluster an anchor and a fixed box", () => {
    const graph = buildGraph([], [worktree("/p/shop-a")], []);
    const { anchors } = autoLayout(graph);
    const anchor = anchors.get(clusterId("/p/shop-a"))!;
    expect(clusterRect("wt:/p/shop-a", [], new Map(), anchor).w).toBeGreaterThan(NODE_W);
  });
});

describe("canvas state", () => {
  it("lets a dragged spot win over the auto layout", () => {
    const auto = new Map([["a", { x: 0, y: 0 }], ["b", { x: 10, y: 10 }]]);
    expect(resolvePositions(auto, { a: { x: 500, y: 500 } }).get("a")).toEqual({ x: 500, y: 500 });
    expect(resolvePositions(auto, { a: { x: 500, y: 500 } }).get("b")).toEqual({ x: 10, y: 10 });
  });

  it("forgets closed sessions", () => {
    const state = { ...EMPTY_CANVAS, positions: { a: { x: 1, y: 1 }, gone: { x: 2, y: 2 } }, groups: [{ id: "g", name: "그룹", memberIds: ["a", "gone"] }] };
    const pruned = pruneCanvas(state, new Set(["a"]));
    expect(Object.keys(pruned.positions)).toEqual(["a"]);
    expect(pruned.groups[0]?.memberIds).toEqual(["a"]);
  });

  it("reads back only well-formed saved data", () => {
    expect(parseCanvasState("not json")).toEqual(EMPTY_CANVAS);
    expect(parseCanvasState(JSON.stringify({ positions: { a: { x: 1, y: 2 }, b: "x" }, groups: [{ id: 1 }], viewport: { x: 0, y: 0, zoom: 9 }, sizes: { a: { w: 300, h: 140 }, b: { w: -1, h: 2 } } }))).toEqual({
      positions: { a: { x: 1, y: 2 } },
      groups: [],
      viewport: { x: 0, y: 0, zoom: 2 },
      ends: {},
      sizes: { a: { w: 300, h: 140 } },
    });
  });
});

describe("areas inside a worktree", () => {
  const graph = buildGraph(
    ["loose", "doing1", "doing2", "later1"].map((id) => agentCard({ id, worktreeId: "/p/shop-a" })),
    [worktree("/p/shop-a")],
    [],
  );
  const doing = { id: "doing", name: "하고 있는 일", memberIds: ["doing1", "doing2"], collapsed: false };
  const later = { id: "later", name: "나중에 볼 일", memberIds: ["later1"], collapsed: false };

  it("stacks the sessions in no area on top, then each area below its header, inside the worktree frame", () => {
    const layout = autoLayout(graph, { areasOf: () => [doing, later] });
    const at = (id: string) => layout.positions.get(id)!;
    const doingTop = at("loose").y + NODE_H;
    expect(at("doing1").y).toBeGreaterThan(doingTop + AREA_HEAD - 1);
    expect(at("doing2").y).toBe(at("doing1").y);
    expect(at("later1").y).toBeGreaterThan(at("doing1").y + NODE_H + AREA_HEAD - 1);
    expect(layout.anchors.get(areaKey("doing"))!.y).toBe(at("doing1").y - AREA_HEAD);
  });

  it("hides a folded area's sessions and keeps only its header", () => {
    const layout = autoLayout(graph, { areasOf: () => [{ ...doing, collapsed: true }, later] });
    expect(layout.positions.has("doing1")).toBe(false);
    expect(layout.anchors.has(areaKey("doing"))).toBe(true);
    expect(layout.positions.get("later1")!.y).toBe(layout.anchors.get(areaKey("later"))!.y + AREA_HEAD);
  });

  it("draws an area around its sessions, or as a bare header where it holds none", () => {
    const layout = autoLayout(graph, { areasOf: () => [doing, { ...later, collapsed: true }] });
    const rect = areaRect(doing.memberIds, layout.positions, layout.anchors.get(areaKey("doing"))!);
    expect(rect.y).toBe(layout.anchors.get(areaKey("doing"))!.y);
    expect(rect.h).toBeGreaterThan(NODE_H + AREA_HEAD);
    expect(areaRect(later.memberIds, layout.positions, layout.anchors.get(areaKey("later"))!).h).toBe(AREA_HEAD);
  });

  it("keeps area sessions in their laid-out spot and moves them with a dragged worktree", () => {
    const layout = autoLayout(graph, { areasOf: () => [doing] });
    const cluster = clusterId("/p/shop-a");
    const autoAnchor = layout.anchors.get(cluster)!;
    const saved = { [cluster]: { x: autoAnchor.x + 100, y: autoAnchor.y + 50 }, doing1: { x: 9999, y: 9999 }, loose: { x: 7, y: 7 } };
    const { positions, anchors } = resolveLayout(layout, saved, new Set(doing.memberIds));
    expect(positions.get("doing1")).toEqual({ x: layout.positions.get("doing1")!.x + 100, y: layout.positions.get("doing1")!.y + 50 });
    expect(positions.get("loose")).toEqual({ x: 7, y: 7 });
    expect(anchors.get(areaKey("doing"))!.x).toBe(layout.anchors.get(areaKey("doing"))!.x + 100);
  });

  it("turns an old group inside one worktree into that worktree's area and drops one that crossed worktrees, waiting on one with sessions not loaded yet", () => {
    const worktreeOf = (id: string) => ({ a: "w1", b: "w1", c: "w2" })[id];
    expect(
      groupsToAreas(
        [
          { id: "g1", name: "리뷰", memberIds: ["a", "b"] },
          { id: "g2", name: "섞임", memberIds: ["a", "c"] },
          { id: "g3", name: "아직", memberIds: ["a", "unloaded"] },
        ],
        worktreeOf,
      ),
    ).toEqual({
      areas: [{ worktreeId: "w1", area: { id: "g1", name: "리뷰", memberIds: ["a", "b"], collapsed: false } }],
      settledIds: ["g1", "g2"],
    });
  });

  it("grows the worktree frame to hold an area header with no sessions", () => {
    const layout = autoLayout(graph, { areasOf: () => [{ ...later, memberIds: [] }] });
    const cluster = graph.clusters[0]!;
    const header = areaRect([], layout.positions, layout.anchors.get(areaKey("later"))!);
    const frame = clusterRect(cluster.id, cluster.nodeIds, layout.positions, layout.anchors.get(cluster.id)!, {}, [header]);
    expect(frame.y + frame.h).toBeGreaterThanOrEqual(header.y + header.h);
  });
});

describe("line ends", () => {
  const left = { x: 0, y: 0, w: 100, h: 50 };
  const right = { x: 300, y: 0, w: 100, h: 50 };

  it("leaves from the facing sides unless a side is pinned", () => {
    expect(edgeGeometry(left, right).start).toEqual({ x: 100, y: 25 });
    expect(edgeGeometry(left, right, { from: "bottom", to: "top" })).toMatchObject({ start: { x: 50, y: 50 }, end: { x: 350, y: 0 } });
  });

  it("puts lines joining the same two boxes in either direction on one shared lane", () => {
    const lanes = sharedLanes([
      { id: "plan-review", from: "plan", to: "review" },
      { id: "review-pr", from: "review", to: "pr" },
      { id: "review-plan", from: "review", to: "plan" },
    ]);
    expect(lanes.map((lane) => lane.map((edge) => edge.id))).toEqual([["plan-review", "review-plan"], ["review-pr"]]);
  });

  it("picks the side nearest to where an end was dropped", () => {
    expect(nearestSide(left, { x: 50, y: 48 })).toBe("bottom");
    expect(nearestSide(left, { x: 2, y: 20 })).toBe("left");
  });

  it("keeps pinned sides across a reload and drops them on tidy", () => {
    const pinned = setEdgeEnd(EMPTY_CANVAS, "l1", "to", "top");
    const reloaded = parseCanvasState(JSON.stringify({ ...pinned, ends: { ...pinned.ends, bad: { from: "middle" } } }));
    expect(reloaded.ends).toEqual({ l1: { to: "top" } });
    expect(resetPositions(reloaded).ends).toEqual({});
  });
});
