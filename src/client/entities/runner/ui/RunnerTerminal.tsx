"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import type { TerminalClientMessage, TerminalServerMessage } from "@/common/runner/types";
import { terminalSocketUrl } from "../api/runnerApi";

interface RunnerTerminalProps {
  sessionId: string;
}

function isServerMessage(value: unknown): value is TerminalServerMessage {
  return typeof value === "object" && value !== null && "type" in value && (value.type === "output" || value.type === "exit");
}

function readCssVar(element: HTMLElement, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

export function RunnerTerminal({ sessionId }: RunnerTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const life: { disposed: boolean; cleanup: () => void } = { disposed: false, cleanup: () => {} };

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (life.disposed) return;

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: readCssVar(host, "--font-mono") || "monospace",
        fontSize: 13,
        scrollback: 5000,
        theme: { background: readCssVar(host, "--tint"), foreground: readCssVar(host, "--fg"), cursor: readCssVar(host, "--fg") },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(host);

      const socket = new WebSocket(terminalSocketUrl(sessionId));
      const sendMessage = (message: TerminalClientMessage) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      };
      const syncSize = () => {
        fit.fit();
        sendMessage({ type: "resize", cols: terminal.cols, rows: terminal.rows });
      };

      socket.onopen = () => {
        syncSize();
        terminal.focus();
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const message: unknown = JSON.parse(event.data);
          if (!isServerMessage(message)) return;
          if (message.type === "output") terminal.write(message.data);
          else terminal.write(`\r\n\x1b[2m[세션이 끝났어요 · 종료 코드 ${message.exitCode}]\x1b[0m\r\n`);
        } catch (error) {
          console.error("[runner] bad terminal message", error);
        }
      };
      socket.onclose = () => {
        if (!life.disposed) terminal.write("\r\n\x1b[2m[세션 러너와 연결이 끊겼어요]\x1b[0m\r\n");
      };

      const input = terminal.onData((data) => sendMessage({ type: "input", data }));
      const observer = new ResizeObserver(() => syncSize());
      observer.observe(host);

      life.cleanup = () => {
        observer.disconnect();
        input.dispose();
        socket.close();
        terminal.dispose();
      };
    })().catch((error: unknown) => console.error("[runner] terminal failed to start", error));

    return () => {
      life.disposed = true;
      life.cleanup();
    };
  }, [sessionId]);

  return <div ref={hostRef} className="h-full min-h-0 w-full overflow-hidden rounded-[10px] bg-tint p-2" />;
}
