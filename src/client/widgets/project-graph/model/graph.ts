import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import type { FileOverlap } from "@/common/projects/overlaps";
import type { LinkKind } from "@/common/orchestration/types";

export type NodeKind = "conductor" | "session";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  agent: AgentCard;
}

export interface GraphCluster {
  /** `wt:<worktreeId>` — shares the id space with nodes so an edge can end on a cluster. */
  id: string;
  worktree: WorktreeSummary;
  nodeIds: string[];
}

export type EdgeKind = LinkKind | "fork" | "overlap";

export interface GraphEdge {
  id: string;
  kind: EdgeKind;
  from: string;
  to: string;
  /** The daemon link behind a delegate / report / next edge, for unlinking and resuming. */
  linkId: string | null;
  paused: boolean;
  /** What a next line sends, kept so the line can be moved to another box without losing it. */
  prompt: string | null;
  /** Files both worktrees changed, for an overlap edge. */
  files: string[];
}

export interface ProjectGraph {
  conductors: GraphNode[];
  clusters: GraphCluster[];
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

export const clusterId = (worktreeId: string) => `wt:${worktreeId}`;

/**
 * Turns one project's board data into boxes and lines. Conductors leave their worktree and sit on
 * top; every other session stays in its worktree's cluster. Lines whose other end is not on this
 * project's board are dropped.
 */
export function buildGraph(agents: AgentCard[], worktrees: WorktreeSummary[], overlaps: FileOverlap[]): ProjectGraph {
  const nodes = new Map<string, GraphNode>();
  for (const agent of agents) {
    nodes.set(agent.id, { id: agent.id, kind: agent.orchestration?.conductor ? "conductor" : "session", agent });
  }
  const conductors = [...nodes.values()].filter((node) => node.kind === "conductor");
  const clusters: GraphCluster[] = worktrees.map((worktree) => ({
    id: clusterId(worktree.worktreeId),
    worktree,
    nodeIds: agents.filter((agent) => agent.worktreeId === worktree.worktreeId && nodes.get(agent.id)?.kind === "session").map((agent) => agent.id),
  }));
  const clusterIds = new Set(clusters.map((cluster) => cluster.id));

  const edges: GraphEdge[] = [];
  for (const agent of agents) {
    for (const link of agent.orchestration?.links ?? []) {
      if (!nodes.has(link.from) || !nodes.has(link.to)) continue;
      edges.push({ id: link.id, kind: link.kind, from: link.from, to: link.to, linkId: link.id, paused: link.paused, prompt: link.prompt, files: [] });
    }
  }
  for (const worktree of worktrees) {
    if (!worktree.parentWorktreeId) continue;
    const parent = clusterId(worktree.parentWorktreeId);
    if (!clusterIds.has(parent)) continue;
    edges.push({ id: `fork:${worktree.worktreeId}`, kind: "fork", from: parent, to: clusterId(worktree.worktreeId), linkId: null, paused: false, prompt: null, files: [] });
  }
  for (const overlap of overlaps) {
    const from = clusterId(overlap.a);
    const to = clusterId(overlap.b);
    if (!clusterIds.has(from) || !clusterIds.has(to)) continue;
    edges.push({ id: `overlap:${overlap.a}:${overlap.b}`, kind: "overlap", from, to, linkId: null, paused: false, prompt: null, files: overlap.files });
  }
  return { conductors, clusters, nodes, edges };
}

/** Lines touching one session, for the side panel. */
export function edgesOf(graph: ProjectGraph, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.linkId !== null && (edge.from === nodeId || edge.to === nodeId));
}
