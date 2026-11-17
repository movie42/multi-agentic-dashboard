import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import type { FileOverlap } from "@/common/projects/overlaps";
import type { LinkKind } from "@/common/orchestration/types";
import type { TemplateCard, TemplateRun } from "@/common/templates/types";

export type NodeKind = "conductor" | "session";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  agent: AgentCard;
  /** Set on a conductor from outside this project drawn here because it works with sessions here: its project name, or null for an app conductor. */
  outside?: { repo: string | null };
}

/** Sessions a conductor handed work to in another project, per project. */
export interface ElsewhereWorkers {
  repo: string;
  count: number;
}

export interface GraphCluster {
  /** `wt:<worktreeId>` — shares the id space with nodes so an edge can end on a cluster. */
  id: string;
  worktree: WorktreeSummary;
  nodeIds: string[];
}

export type EdgeKind = LinkKind | "fork" | "overlap";

export interface ReservedCard {
  id: string;
  run: TemplateRun;
  card: TemplateCard;
}

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
  /** The template run line behind a next / report edge between run cards. */
  route?: { runId: string; routeId: string; label: string | null };
}

export interface ProjectGraph {
  conductors: GraphNode[];
  /** Per conductor of this project: workers it has in other projects. */
  elsewhere: Map<string, ElsewhereWorkers[]>;
  clusters: GraphCluster[];
  nodes: Map<string, GraphNode>;
  reserved: Map<string, ReservedCard>;
  runs: TemplateRun[];
  edges: GraphEdge[];
}

export const clusterId = (worktreeId: string) => `wt:${worktreeId}`;

export const reservedId = (runId: string, cardKey: string) => `run:${runId}:${cardKey}`;

export function runCardNode(run: TemplateRun, cardKey: string, nodes: ReadonlyMap<string, GraphNode>): string {
  const session = run.sessions[cardKey];
  return session && nodes.has(session) ? session : reservedId(run.id, cardKey);
}

export function runOfNode(runs: TemplateRun[], nodeId: string): TemplateRun | null {
  return runs.find((run) => nodeId.startsWith(`run:${run.id}:`) || Object.values(run.sessions).includes(nodeId)) ?? null;
}

/**
 * Turns one project's board data into boxes and lines. Conductors leave their worktree and sit on
 * top; every other session stays in its worktree's cluster. A conductor from another project (or one
 * opened outside every project) that works with a session here is drawn on top too, marked as from
 * outside. Other lines whose far end is not on this project's board are dropped; a conductor's
 * workers elsewhere are counted in `elsewhere` instead.
 */
export function buildGraph(
  agents: AgentCard[],
  worktrees: WorktreeSummary[],
  overlaps: FileOverlap[],
  runs: TemplateRun[] = [],
  everyAgent: AgentCard[] = agents,
): ProjectGraph {
  const nodes = new Map<string, GraphNode>();
  for (const agent of agents) {
    nodes.set(agent.id, { id: agent.id, kind: agent.orchestration?.conductor ? "conductor" : "session", agent });
  }
  const here = new Set(nodes.keys());
  const touchesHere = (conductor: AgentCard) =>
    (conductor.orchestration?.links ?? []).some((link) => here.has(link.to)) ||
    agents.some((agent) => agent.parentId === conductor.id || (agent.orchestration?.links ?? []).some((link) => link.to === conductor.id));
  for (const agent of everyAgent) {
    if (nodes.has(agent.id) || !agent.orchestration?.conductor || !touchesHere(agent)) continue;
    nodes.set(agent.id, { id: agent.id, kind: "conductor", agent, outside: { repo: agent.repo || null } });
  }
  const byId = new Map(everyAgent.map((agent) => [agent.id, agent]));
  const elsewhere = new Map<string, ElsewhereWorkers[]>();
  for (const id of here) {
    const counts = new Map<string, number>();
    for (const link of nodes.get(id)?.agent.orchestration?.links ?? []) {
      const target = link.kind === "delegate" && !nodes.has(link.to) ? byId.get(link.to) : undefined;
      if (target?.repo) counts.set(target.repo, (counts.get(target.repo) ?? 0) + 1);
    }
    if (counts.size > 0) elsewhere.set(id, [...counts].map(([repo, count]) => ({ repo, count })));
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
  const reserved = new Map<string, ReservedCard>();
  const shownRuns = runs.filter((run) => clusters.some((cluster) => cluster.worktree.path === run.cwd));
  for (const run of shownRuns) {
    const cluster = clusters.find((entry) => entry.worktree.path === run.cwd);
    if (!cluster) continue;
    for (const card of run.cards) {
      const id = runCardNode(run, card.key, nodes);
      if (nodes.has(id) || reserved.has(id)) continue;
      reserved.set(id, { id, run, card });
      cluster.nodeIds.push(id);
    }
    for (const route of run.routes) {
      const from = runCardNode(run, route.from, nodes);
      const to = runCardNode(run, route.to, nodes);
      if (from === to) continue;
      edges.push({
        id: `route:${run.id}:${route.id}`,
        kind: route.kind,
        from,
        to,
        linkId: null,
        paused: false,
        prompt: route.prompt,
        files: [],
        route: { runId: run.id, routeId: route.id, label: route.label },
      });
    }
  }
  return { conductors, elsewhere, clusters, nodes, reserved, runs: shownRuns, edges };
}

/** Lines touching one session, for the side panel. */
export function edgesOf(graph: ProjectGraph, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.linkId !== null && (edge.from === nodeId || edge.to === nodeId));
}
