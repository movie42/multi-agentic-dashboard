import type { AgentCard } from "@/common/orca/types";
import type { SessionSummary } from "@/common/sessions/types";

export interface TodoSessionView {
  id: string;
  title: string;
  agent: AgentCard | null;
  summary: SessionSummary | null;
}

export type SessionLookup = (sessionId: string) => TodoSessionView;

export function sessionLookup(agents: readonly AgentCard[], summaries: readonly SessionSummary[]): SessionLookup {
  const agentBySession = new Map(agents.flatMap((agent) => (agent.session ? [[agent.session.id, agent] as const] : [])));
  const summaryBySession = new Map(summaries.map((summary) => [summary.sessionId, summary]));
  return (id) => {
    const agent = agentBySession.get(id) ?? null;
    const summary = summaryBySession.get(id) ?? null;
    const title = agent?.session?.title ?? agent?.title ?? summary?.title ?? `세션 ${id.slice(0, 8)}`;
    return { id, title, agent, summary };
  };
}
