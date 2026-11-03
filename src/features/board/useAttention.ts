"use client";

import { useEffect, useRef } from "react";
import type { AgentCard, AgentState } from "@/lib/orca/types";
import { parseMessage } from "./message";

const APP_TITLE = "Agent Control";

const ARRIVAL_LABEL: Partial<Record<AgentState, string>> = {
  done: "내 차례",
  blocked: "막힘",
  waiting: "내 입력 대기",
};

function notify(agent: AgentCard, label: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const body = parseMessage(agent.lastMessage)?.lead ?? agent.prompt ?? "";
  const notification = new Notification(`${label} · ${agent.repo}`, {
    body: body.slice(0, 180),
    tag: agent.id,
  });
  notification.onclick = () => window.focus();
}

export function useAttention(agents: AgentCard[] | null, needsMeCount: number) {
  const previous = useRef<Map<string, AgentState> | null>(null);

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
        if (label && seen.get(agent.id) === "working") notify(agent, label);
      }
    }
    previous.current = new Map(agents.map((agent) => [agent.id, agent.state]));
  }, [agents]);
}
