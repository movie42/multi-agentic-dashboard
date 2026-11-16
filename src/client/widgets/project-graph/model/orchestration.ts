import type { AgentCard } from "@/common/board/types";
import type { LinkKind, OrchestrationState, SessionLink, WorktreeProposal } from "@/common/orchestration/types";

export const LINK_LABEL: Record<LinkKind, string> = { delegate: "맡김", report: "보고", next: "끝나면" };

export interface ProjectOrchestration {
  /** Conductors drawn above the lanes: project-wide ones. */
  top: AgentCard[];
  conductorIds: ReadonlySet<string>;
  links: { id: string; kind: LinkKind; from: string; to: string; label: string }[];
  proposals: WorktreeProposal[];
  linksOf: (sessionId: string) => SessionLink[];
}

/** The part of the runner's orchestration state that belongs to one project's sessions. */
export function projectOrchestration(state: OrchestrationState, agents: AgentCard[]): ProjectOrchestration {
  const ids = new Set(agents.map((agent) => agent.id));
  const conductors = state.conductors.filter((conductor) => ids.has(conductor.sessionId));
  const projectWide = new Set(conductors.filter((conductor) => conductor.scope.kind === "project").map((conductor) => conductor.sessionId));
  const links = state.links.filter((link) => ids.has(link.from) && ids.has(link.to));
  return {
    top: agents.filter((agent) => projectWide.has(agent.id)),
    conductorIds: new Set(conductors.map((conductor) => conductor.sessionId)),
    links: links.map((link) => ({
      id: link.id,
      kind: link.kind,
      from: link.from,
      to: link.to,
      label: link.paused ? `멈춤 · ${link.trips}회` : LINK_LABEL[link.kind],
    })),
    proposals: state.proposals.filter((proposal) => ids.has(proposal.conductorId)),
    linksOf: (sessionId) => links.filter((link) => link.from === sessionId || link.to === sessionId),
  };
}
