import { describe, expect, it } from "vitest";
import type { WorktreeSummary } from "@/common/board/types";
import type { OrchestrationLink, SessionOrchestration } from "@/common/orchestration/types";
import { agentCard } from "../../../../../test/fixtures";
import { buildGraph, clusterId } from "./graph";
import { autoLayout, chainColumns, clusterRect, edgeGeometry, NODE_H, NODE_W, nearestSide } from "./layout";
import { EMPTY_CANVAS, groupNodes, parseCanvasState, pruneCanvas, resetPositions, resolvePositions, setEdgeEnd, ungroup } from "./canvasState";

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

  it("gives an empty cluster an anchor and a fixed box", () => {
    const graph = buildGraph([], [worktree("/p/shop-a")], []);
    const { anchors } = autoLayout(graph);
    const anchor = anchors.get(clusterId("/p/shop-a"))!;
    expect(clusterRect([], new Map(), anchor).w).toBeGreaterThan(NODE_W);
  });
});

describe("canvas state", () => {
  it("lets a dragged spot win over the auto layout", () => {
    const auto = new Map([["a", { x: 0, y: 0 }], ["b", { x: 10, y: 10 }]]);
    expect(resolvePositions(auto, { a: { x: 500, y: 500 } }).get("a")).toEqual({ x: 500, y: 500 });
    expect(resolvePositions(auto, { a: { x: 500, y: 500 } }).get("b")).toEqual({ x: 10, y: 10 });
  });

  it("moves a node out of its old group when it joins a new one, and drops the emptied group", () => {
    const first = groupNodes(EMPTY_CANVAS, ["a"], "g1", "하나");
    const second = groupNodes(first, ["a", "b"], "g2", "둘");
    expect(second.groups).toEqual([{ id: "g2", name: "둘", memberIds: ["a", "b"] }]);
    expect(ungroup(second, "g2").groups).toEqual([]);
  });

  it("forgets closed sessions", () => {
    const state = groupNodes({ ...EMPTY_CANVAS, positions: { a: { x: 1, y: 1 }, gone: { x: 2, y: 2 } } }, ["a", "gone"], "g", "그룹");
    const pruned = pruneCanvas(state, new Set(["a"]));
    expect(Object.keys(pruned.positions)).toEqual(["a"]);
    expect(pruned.groups[0]?.memberIds).toEqual(["a"]);
  });

  it("reads back only well-formed saved data", () => {
    expect(parseCanvasState("not json")).toEqual(EMPTY_CANVAS);
    expect(parseCanvasState(JSON.stringify({ positions: { a: { x: 1, y: 2 }, b: "x" }, groups: [{ id: 1 }], viewport: { x: 0, y: 0, zoom: 9 } }))).toEqual({
      positions: { a: { x: 1, y: 2 } },
      groups: [],
      viewport: { x: 0, y: 0, zoom: 2 },
      ends: {},
    });
  });
});

describe("line ends", () => {
  const left = { x: 0, y: 0, w: 100, h: 50 };
  const right = { x: 300, y: 0, w: 100, h: 50 };

  it("leaves from the facing sides unless a side is pinned", () => {
    expect(edgeGeometry(left, right).start).toEqual({ x: 100, y: 25 });
    expect(edgeGeometry(left, right, { from: "bottom", to: "top" })).toMatchObject({ start: { x: 50, y: 50 }, end: { x: 350, y: 0 } });
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
