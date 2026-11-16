import type { AgentCard } from "@/common/board/types";
import { blankCard } from "@/client/features/edit-template";
import type { TemplateRoute, WorkflowTemplate } from "@/common/templates/types";
import type { GraphEdge } from "./graph";

export function draftFromSelection(id: string, agents: AgentCard[], edges: GraphEdge[], titleOf: (agent: AgentCard) => string): WorkflowTemplate {
  const ids = new Set(agents.map((agent) => agent.id));
  const nexts = edges.filter((edge) => edge.kind === "next" && ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
  const incoming = new Set(nexts.map((edge) => edge.to));
  const ordered: AgentCard[] = [];
  const visit = (agent: AgentCard) => {
    if (ordered.includes(agent)) return;
    ordered.push(agent);
    nexts.filter((edge) => edge.from === agent.id).forEach((edge) => {
      const next = agents.find((item) => item.id === edge.to);
      if (next) visit(next);
    });
  };
  agents.filter((agent) => !incoming.has(agent.id)).forEach(visit);
  agents.forEach(visit);
  const keyOf = new Map(ordered.map((agent, index) => [agent.id, `c${index + 1}`]));
  const cards = ordered.map((agent, index) => {
    const fed = nexts.find((edge) => edge.to === agent.id)?.prompt;
    return { ...blankCard(`c${index + 1}`, titleOf(agent)), prompt: fed ?? agent.prompt ?? "" };
  });
  const routes: TemplateRoute[] = nexts.flatMap((edge, index) => {
    const from = keyOf.get(edge.from);
    const to = keyOf.get(edge.to);
    return from && to ? [{ id: `r${index + 1}`, from, to, label: null }] : [];
  });
  return { id, name: ordered[0] ? `${titleOf(ordered[0])} 흐름` : "새 템플릿", cards, routes, updatedAt: 0 };
}
