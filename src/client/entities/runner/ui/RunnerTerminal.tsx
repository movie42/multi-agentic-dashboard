"use client";

import "@xterm/xterm/css/xterm.css";
import type { IBufferLine, ILink, ITheme, Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import type { TerminalClientMessage, TerminalServerMessage } from "@/common/runner/types";
import { terminalSocketUrl } from "../api/runnerApi";
import { findTerminalLinks, resolveTerminalPath, targetOfUri } from "../lib/terminalLinks";
import { macTerminalSequence } from "../lib/terminalKeys";

const TERMINAL_FONT = "Jetendard";
const TERMINAL_FONT_SIZE = 13;

interface RunnerTerminalProps {
  sessionId: string;
  /** Folder the session runs in; relative paths printed in the terminal resolve against it. */
  cwd: string | null;
  /** Receives an absolute file path or an http(s) URL Cmd+clicked in the terminal. */
  onOpenLink: (target: string) => void;
}

function isServerMessage(value: unknown): value is TerminalServerMessage {
  return typeof value === "object" && value !== null && "type" in value && (value.type === "output" || value.type === "exit");
}

function readCssVar(element: HTMLElement, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

function readTheme(element: HTMLElement): ITheme {
  const read = (name: string) => readCssVar(element, `--term-${name}`);
  return {
    background: read("bg"),
    foreground: read("fg"),
    cursor: read("cursor"),
    cursorAccent: read("bg"),
    selectionBackground: read("selection"),
    selectionInactiveBackground: read("selection-inactive"),
    black: read("black"),
    red: read("red"),
    green: read("green"),
    yellow: read("yellow"),
    blue: read("blue"),
    magenta: read("magenta"),
    cyan: read("cyan"),
    white: read("white"),
    brightBlack: read("bright-black"),
    brightRed: read("bright-red"),
    brightGreen: read("bright-green"),
    brightYellow: read("bright-yellow"),
    brightBlue: read("bright-blue"),
    brightMagenta: read("bright-magenta"),
    brightCyan: read("bright-cyan"),
    brightWhite: read("bright-white"),
  };
}

/** The line's text plus the cell column of every UTF-16 unit, since a Korean character takes two cells. */
function readLine(line: IBufferLine): { text: string; columns: number[]; widths: number[] } {
  const cells = Array.from({ length: line.length }, (_, x) => ({ x, cell: line.getCell(x) })).flatMap(({ x, cell }) => {
    const width = cell?.getWidth() ?? 1;
    return cell && width > 0 ? [{ x, width, chars: cell.getChars() || " " }] : [];
  });
  // One entry per UTF-16 unit, so the offsets `findTerminalLinks` returns index straight into these.
  const units = cells.flatMap(({ x, width, chars }) => Array.from({ length: chars.length }, () => ({ x, width })));
  return { text: cells.map(({ chars }) => chars).join(""), columns: units.map((unit) => unit.x), widths: units.map((unit) => unit.width) };
}

function linkProvider(terminal: XTerm, open: (text: string, kind: "url" | "path") => void) {
  return {
    provideLinks(y: number, callback: (links: ILink[] | undefined) => void) {
      const line = terminal.buffer.active.getLine(y - 1);
      if (!line) return callback(undefined);
      const { text, columns, widths } = readLine(line);
      const links = findTerminalLinks(text).flatMap((match): ILink[] => {
        const first = columns[match.start];
        const last = columns[match.end - 1];
        const lastWidth = widths[match.end - 1] ?? 1;
        if (first === undefined || last === undefined) return [];
        return [
          {
            range: { start: { x: first + 1, y }, end: { x: last + lastWidth, y } },
            text: match.text,
            activate: (event) => {
              if (event.metaKey) open(match.text, match.kind);
            },
          },
        ];
      });
      callback(links.length > 0 ? links : undefined);
    },
  };
}

export function RunnerTerminal({ sessionId, cwd, onOpenLink }: RunnerTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef({ cwd, onOpenLink });
  useEffect(() => {
    linkRef.current = { cwd, onOpenLink };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const life: { disposed: boolean; cleanup: () => void } = { disposed: false, cleanup: () => {} };

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        // xterm measures cell width once at open; a font that loads later leaves the grid misaligned.
        document.fonts.load(`500 ${TERMINAL_FONT_SIZE}px ${TERMINAL_FONT}`).catch(() => []),
      ]);
      if (life.disposed) return;

      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        fontFamily: `${TERMINAL_FONT}, ${readCssVar(host, "--font-mono") || "monospace"}`,
        fontSize: TERMINAL_FONT_SIZE,
        fontWeight: 500,
        fontWeightBold: 700,
        lineHeight: 1,
        scrollback: 5000,
        // Claude Code may capture the mouse; Option+drag still selects text, as in iTerm.
        macOptionClickForcesSelection: true,
        theme: readTheme(host),
        // OSC 8 hyperlinks Claude Code prints; without a handler xterm asks with window.confirm.
        linkHandler: {
          allowNonHttpProtocols: true,
          activate: (event, uri) => {
            const target = targetOfUri(uri);
            if (event.metaKey && target) linkRef.current.onOpenLink(target);
          },
        },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(host);
      const links = terminal.registerLinkProvider(
        linkProvider(terminal, (text, kind) => {
          const target = kind === "url" ? text : resolveTerminalPath(text, linkRef.current.cwd);
          if (target) linkRef.current.onOpenLink(target);
        }),
      );

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

      terminal.attachCustomKeyEventHandler((event) => {
        const sequence = macTerminalSequence(event);
        if (sequence === null) return true;
        event.preventDefault();
        if (event.type === "keydown") sendMessage({ type: "input", data: sequence });
        return false;
      });

      const input = terminal.onData((data) => sendMessage({ type: "input", data }));
      const observer = new ResizeObserver(() => syncSize());
      observer.observe(host);

      // tmux-style copy: releasing a drag (or a double/triple click) copies the selection.
      const copySelection = () => {
        const selection = terminal.getSelection();
        if (!selection) return;
        navigator.clipboard.writeText(selection).catch((error: unknown) => console.warn("[runner] copy failed", error));
      };
      host.addEventListener("mouseup", copySelection);

      const scheme = window.matchMedia("(prefers-color-scheme: dark)");
      const applyTheme = () => {
        requestAnimationFrame(() => {
          if (!life.disposed) terminal.options.theme = readTheme(host);
        });
      };
      scheme.addEventListener("change", applyTheme);

      life.cleanup = () => {
        scheme.removeEventListener("change", applyTheme);
        host.removeEventListener("mouseup", copySelection);
        observer.disconnect();
        input.dispose();
        links.dispose();
        socket.close();
        terminal.dispose();
      };
    })().catch((error: unknown) => console.error("[runner] terminal failed to start", error));

    return () => {
      life.disposed = true;
      life.cleanup();
    };
  }, [sessionId]);

  return <div ref={hostRef} className="h-full min-h-0 w-full overflow-hidden rounded-[10px] bg-term-bg p-2" />;
}
