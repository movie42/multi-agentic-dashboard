import type { AgentCard } from "@/common/board/types";
import type { RestKind, RestOf } from "./useRestOverrides";

export interface RestChoice {
  /** null takes the mark off. */
  kind: RestKind | null;
  label: string;
}

/** The state changes a person can make by hand on these sessions; a working session cannot be put to rest. */
export function restChoices(agents: AgentCard[], restOf: RestOf): RestChoice[] {
  const settable = agents.filter((agent) => agent.state !== "working");
  if (settable.length === 0) return [];
  const all = (kind: RestKind) => settable.every((agent) => restOf(agent) === kind);
  return [
    ...(all("idle") ? [] : [{ kind: "idle" as const, label: "쉬는 중으로 바꾸기" }]),
    ...(all("dormant") ? [] : [{ kind: "dormant" as const, label: "잠자는 중으로 바꾸기" }]),
    ...(settable.some((agent) => restOf(agent) !== null) ? [{ kind: null, label: "원래 상태로 되돌리기" }] : []),
  ];
}
