import { describe, expect, it } from "vitest";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import { layoutGraph, NODE_W } from "./layout";

function agent(id: string, worktreeId: string): AgentCard {
  return {
    id, worktreeId, repo: "repo", worktreeName: worktreeId, branch: null, worktreePath: `/w/${worktreeId}`, agentType: "claude",
    state: "done", prompt: null, title: null, session: null, lastMessage: null, toolName: null, backgroundRunning: false,
    interrupted: false, stateSince: null, updatedAt: 0, unread: false, terminalHandle: null, artifacts: [],
    parentId: null, model: null, contextPercent: null, permission: null,
  };
}

function worktree(worktreeId: string, parentWorktreeId: string | null = null): WorktreeSummary {
  return {
    worktreeId, repo: "repo", name: worktreeId, branch: `feat/${worktreeId}`, path: `/w/${worktreeId}`, projectPath: "/w/main",
    isMain: worktreeId === "main", parentWorktreeId, unread: false, lastActivityAt: null, flowTasks: [], otherFlowTasks: [],
    pullRequest: { state: "none" }, jira: null, featureId: null,
  } as unknown as WorktreeSummary;
}

describe("layoutGraph", () => {
  const agents: Record<string, AgentCard[]> = {
    main: [agent("m1", "main")],
    a: [agent("a1", "a"), agent("a2", "a"), agent("a3", "a")],
    b: [],
  };
  const input = {
    worktrees: [worktree("main"), worktree("a"), worktree("b", "a")],
    agentsOf: (id: string) => agents[id] ?? [],
    top: [],
  };

  it("puts a branched worktree's lane below its parent's lane", () => {
    const { lanes } = layoutGraph(input);
    const laneOf = (id: string) => lanes.find((lane) => lane.worktree.worktreeId === id)!;
    expect(laneOf("b").y).toBeGreaterThan(laneOf("a").y + laneOf("a").h);
    expect(laneOf("main").y).toBe(laneOf("a").y);
  });

  it("fills a lane two sessions per row, inside the lane", () => {
    const { lanes, nodes } = layoutGraph(input);
    const lane = lanes.find((entry) => entry.worktree.worktreeId === "a")!;
    const inA = nodes.filter((node) => node.laneId === "a");
    expect(new Set(inA.map((node) => node.y)).size).toBe(2);
    for (const node of inA) {
      expect(node.x).toBeGreaterThanOrEqual(lane.x);
      expect(node.x + NODE_W).toBeLessThanOrEqual(lane.x + lane.w);
      expect(node.y + node.h).toBeLessThanOrEqual(lane.y + lane.h);
    }
  });

  it("draws top sessions above every lane", () => {
    const { nodes, lanes } = layoutGraph({ ...input, top: [agent("c1", "main")] });
    const conductor = nodes.find((node) => node.agent.id === "c1")!;
    expect(conductor.laneId).toBeNull();
    expect(Math.min(...lanes.map((lane) => lane.y))).toBeGreaterThan(conductor.y + conductor.h);
  });

  it("keeps lanes of sibling subtrees from overlapping", () => {
    const { lanes } = layoutGraph(input);
    const sorted = lanes.filter((lane) => lane.y === 0).sort((x, y) => x.x - y.x);
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index]!.x).toBeGreaterThanOrEqual(sorted[index - 1]!.x + sorted[index - 1]!.w);
    }
  });
});

describe("layoutGraph with many worktrees", () => {
  it("wraps root lanes into rows instead of one long strip", () => {
    const many = Array.from({ length: 9 }, (_, index) => worktree(`w${index}`));
    const { lanes, width, height } = layoutGraph({
      worktrees: many,
      agentsOf: (id) => [agent(`${id}-1`, id), agent(`${id}-2`, id), agent(`${id}-3`, id)],
      top: [],
    });
    expect(new Set(lanes.map((lane) => lane.y)).size).toBeGreaterThan(1);
    expect(width / height).toBeLessThan(4);
  });
});
