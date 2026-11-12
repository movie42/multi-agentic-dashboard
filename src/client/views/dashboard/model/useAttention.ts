"use client";

import { useEffect, useRef } from "react";
import type { AgentCard, AgentState } from "@/common/orca/types";
import { parseMessage } from "@/client/shared/lib/message";

const APP_TITLE = "Agent Control";

const ARRIVAL_LABEL: Partial<Record<AgentState, string>> = {
  done: "내 차례",
  blocked: "막힘",
  waiting: "내 입력 대기",
};

function notify(agent: AgentCard, label: string, onOpen: (agent: AgentCard) => void) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const body = parseMessage(agent.lastMessage)?.lead ?? agent.prompt ?? "";
  const notification = new Notification(`${label} · ${agent.repo}`, {
    body: body.slice(0, 180),
    tag: agent.id,
  });
  notification.onclick = () => {
    window.focus();
    onOpen(agent);
  };
}

export function useAttention(
  agents: AgentCard[] | null,
  needsMeCount: number,
  folded: ReadonlySet<string>,
  onOpen: (agent: AgentCard) => void,
) {
  const previous = useRef<Map<string, AgentState> | null>(null);
  // The notification outlives the render that created it, so its click must reach the latest handler.
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  });

  useEffect(() => {
    document.title = needsMeCount > 0 ? `(${needsMeCount}) ${APP_TITLE}` : APP_TITLE;
  }, [needsMeCount]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch((error: unknown) => console.warn("[attention] permission", error));
    }
  }, []);

  useEffect(() => {
    if (!agents) return;
    const seen = previous.current;
    if (seen) {
      for (const agent of agents) {
        const label = ARRIVAL_LABEL[agent.state];
        if (label && seen.get(agent.id) === "working" && !folded.has(agent.id)) notify(agent, label, (target) => openRef.current(target));
      }
    }
    previous.current = new Map(agents.map((agent) => [agent.id, agent.state]));
  }, [agents]);
}
