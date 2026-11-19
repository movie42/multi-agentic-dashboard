"use client";

import { useEffect, useRef } from "react";
import type { AgentCard, AgentState } from "@/common/board/types";
import { parseMessage } from "@/client/shared/lib/message";
import { desktopBridge } from "./desktopBridge";

const APP_TITLE = "Agent Control";

const ARRIVAL_LABEL: Partial<Record<AgentState, string>> = {
  done: "내 차례",
  blocked: "막힘",
  waiting: "내 입력 대기",
};

function notify(agent: AgentCard, label: string, onOpen: (agent: AgentCard) => void) {
  const title = `${label} · ${agent.repo}`;
  const body = (parseMessage(agent.lastMessage)?.lead ?? agent.prompt ?? "").slice(0, 180);
  // The desktop app routes through the main process: a renderer-side window.focus() cannot raise
  // a hidden or minimized window, so the click would land on a board nobody can see.
  const bridge = desktopBridge();
  if (bridge) {
    bridge.notify({ id: agent.id, title, body });
    return;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const notification = new Notification(title, { body, tag: agent.id });
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
  const agentsRef = useRef(agents);
  useEffect(() => {
    openRef.current = onOpen;
    agentsRef.current = agents;
  });

  useEffect(() => {
    document.title = needsMeCount > 0 ? `(${needsMeCount}) ${APP_TITLE}` : APP_TITLE;
  }, [needsMeCount]);

  useEffect(() => {
    if (desktopBridge()) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch((error: unknown) => console.warn("[attention] permission", error));
    }
  }, []);

  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    return bridge.onOpenAgent((agentId) => {
      const agent = agentsRef.current?.find((candidate) => candidate.id === agentId);
      if (agent) openRef.current(agent);
      else console.warn("[attention] notification for a session no longer on the board", agentId);
    });
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
