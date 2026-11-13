"use client";

import { useEffect, useState } from "react";
import type { RunnerSession, SessionsMessage } from "@/common/runner/types";
import { EVENTS_SOCKET_URL } from "../api/runnerApi";

const RETRY_MS = 2000;

export type RunnerConnection =
  | { state: "connecting" }
  | { state: "online"; sessions: RunnerSession[] }
  | { state: "offline" };

function isSessionsMessage(value: unknown): value is SessionsMessage {
  return typeof value === "object" && value !== null && "type" in value && value.type === "sessions" && "sessions" in value && Array.isArray(value.sessions);
}

export function useRunnerSessions(): RunnerConnection {
  const [connection, setConnection] = useState<RunnerConnection>({ state: "connecting" });

  useEffect(() => {
    const live: { socket: WebSocket | null; retry: ReturnType<typeof setTimeout> | null; stopped: boolean } = {
      socket: null,
      retry: null,
      stopped: false,
    };

    const connect = () => {
      const socket = new WebSocket(EVENTS_SOCKET_URL);
      live.socket = socket;
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const message: unknown = JSON.parse(event.data);
          if (isSessionsMessage(message)) setConnection({ state: "online", sessions: message.sessions });
        } catch (error) {
          console.error("[runner] bad events message", error);
        }
      };
      socket.onclose = () => {
        if (live.stopped) return;
        setConnection({ state: "offline" });
        live.retry = setTimeout(connect, RETRY_MS);
      };
    };

    connect();
    return () => {
      live.stopped = true;
      if (live.retry) clearTimeout(live.retry);
      live.socket?.close();
    };
  }, []);

  return connection;
}
