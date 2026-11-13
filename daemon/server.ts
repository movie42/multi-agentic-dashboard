import { stat } from "node:fs/promises";
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  RUNNER_HOOK_EVENTS,
  type RunnerHookEvent,
  type RunnerLaunchRequest,
  type SessionsMessage,
  type TerminalClientMessage,
  type TerminalServerMessage,
} from "../src/common/runner/types.ts";
import { callerOf } from "./guard.ts";
import { answerOf, permissionInputOf } from "./session/permissions.ts";
import { parseStatusLine } from "./session/statusLine.ts";
import type { SessionRegistry } from "./session/SessionRegistry.ts";

export interface RunnerServerOptions {
  registry: SessionRegistry;
  port: number;
  allowedOrigins: readonly string[];
}

export interface RunnerServer {
  server: http.Server;
  broadcast(message: SessionsMessage): void;
}

const MAX_BODY = 1024 * 1024;
const SUBMIT_DELAY_MS = 300;
const SESSION_PATH = /^\/sessions\/([^/]+)$/;
const INPUT_PATH = /^\/sessions\/([^/]+)\/input$/;
const SCREEN_PATH = /^\/sessions\/([^/]+)\/screen$/;
const TERMINAL_PATH = /^\/sessions\/([^/]+)\/terminal$/;
const SESSION_ID = /^[A-Za-z0-9-]{1,64}$/;
const HOOK_PATH = /^\/hooks\/([^/]+)\/([A-Za-z]+)$/;
const STATUSLINE_PATH = /^\/statusline\/([^/]+)$/;
const PERMISSION_PATH = /^\/sessions\/([^/]+)\/permission$/;

function isHookEvent(value: string): value is RunnerHookEvent {
  return RUNNER_HOOK_EVENTS.some((event) => event === value);
}

async function readBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    if (chunks.reduce((total, part) => total + part.length, 0) > MAX_BODY) throw new Error("body too large");
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function field(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null ? Reflect.get(body, key) : undefined;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function launchRequestOf(body: unknown): RunnerLaunchRequest | null {
  const cwd = field(body, "cwd");
  const prompt = field(body, "prompt");
  const resumeSessionId = field(body, "resumeSessionId");
  const kind = field(body, "kind");
  if (typeof cwd !== "string" || !cwd.startsWith("/")) return null;
  return {
    cwd,
    kind: kind === "shell" ? "shell" : "claude",
    ...(typeof prompt === "string" && prompt.trim() ? { prompt } : {}),
    ...(typeof resumeSessionId === "string" && SESSION_ID.test(resumeSessionId) ? { resumeSessionId } : {}),
  };
}

export function pasteOf(text: string): string {
  return /[\r\n]/.test(text) ? `\x1b[200~${text}\x1b[201~` : text;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseClientMessage(raw: string): TerminalClientMessage | null {
  try {
    const value: unknown = JSON.parse(raw);
    const type = field(value, "type");
    const data = field(value, "data");
    const cols = field(value, "cols");
    const rows = field(value, "rows");
    if (type === "input" && typeof data === "string") return { type, data };
    if (type === "resize" && typeof cols === "number" && typeof rows === "number") return { type, cols, rows };
    return null;
  } catch {
    return null;
  }
}

function send(socket: WebSocket, message: TerminalServerMessage | SessionsMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

export function createRunnerServer({ registry, port, allowedOrigins }: RunnerServerOptions): RunnerServer {
  const sockets = new WebSocketServer({ noServer: true });
  const watchers = new Set<WebSocket>();

  const respond = (response: http.ServerResponse, origin: string | undefined, status: number, body: unknown) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (origin) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Vary"] = "Origin";
    }
    response.writeHead(status, headers);
    response.end(JSON.stringify(body));
  };

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://runner");
    const origin = request.headers.origin;
    const caller = callerOf({ host: request.headers.host, origin }, port, allowedOrigins);
    if (caller === "rejected") {
      response.writeHead(403).end();
      return;
    }

    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Origin": origin ?? "",
          "Access-Control-Allow-Methods": "GET, POST, DELETE",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        });
        response.end();
        return;
      }

      const hook = HOOK_PATH.exec(url.pathname);
      if (hook && request.method === "POST" && hook[2] === "PermissionRequest") {
        const id = decodeURIComponent(hook[1] ?? "");
        const input = permissionInputOf(await readBody(request));
        if (!input || watchers.size === 0) {
          respond(response, undefined, 200, {});
          return;
        }
        const pending = registry.holdPermission(id, input);
        const requestId = registry.get(id)?.permission?.id ?? null;
        const onClose = () => {
          if (requestId && !response.writableEnded) registry.cancelPermission(id, requestId);
        };
        response.on("close", onClose);
        const output = await pending;
        response.off("close", onClose);
        console.log("[runner] permission settled", id, output.hookSpecificOutput?.decision.behavior ?? "none");
        respond(response, undefined, 200, output);
        return;
      }

      const statusLine = STATUSLINE_PATH.exec(url.pathname);
      if (statusLine && request.method === "POST") {
        const report = parseStatusLine(await readBody(request));
        if (report) registry.report(decodeURIComponent(statusLine[1] ?? ""), report);
        respond(response, undefined, 200, {});
        return;
      }

      const permission = PERMISSION_PATH.exec(url.pathname);
      if (permission && request.method === "POST") {
        const parsed = answerOf(await readBody(request));
        const answered = parsed ? registry.answerPermission(decodeURIComponent(permission[1] ?? ""), parsed.requestId, parsed.answer) : false;
        respond(response, origin, answered ? 200 : 409, answered ? { ok: true } : { ok: false, error: "이미 끝난 권한 요청이에요." });
        return;
      }

      if (hook && request.method === "POST") {
        const body = await readBody(request);
        const [, id = "", event = ""] = hook;
        if (isHookEvent(event)) {
          const notificationType = field(body, "notification_type");
          registry.signal(decodeURIComponent(id), {
            event,
            notificationType: typeof notificationType === "string" ? notificationType : null,
          });
        }
        respond(response, undefined, 200, {});
        return;
      }

      if (url.pathname === "/sessions" && request.method === "GET") {
        respond(response, origin, 200, { ok: true, sessions: registry.list() });
        return;
      }

      if (url.pathname === "/sessions" && request.method === "POST") {
        const launch = launchRequestOf(await readBody(request));
        if (!launch || !(await isDirectory(launch.cwd))) {
          respond(response, origin, 400, { ok: false, error: "폴더를 찾을 수 없어요. 절대 경로를 입력해 주세요." });
          return;
        }
        respond(response, origin, 200, { ok: true, session: registry.launch(launch) });
        return;
      }

      const input = INPUT_PATH.exec(url.pathname);
      if (input && request.method === "POST") {
        const id = decodeURIComponent(input[1] ?? "");
        const body = await readBody(request);
        const text = field(body, "text");
        const target = registry.get(id);
        if (!target || target.status === "exited") {
          respond(response, origin, 404, { ok: false, error: "세션이 없거나 이미 끝났어요." });
          return;
        }
        if (typeof text !== "string") {
          respond(response, origin, 400, { ok: false, error: "보낼 내용이 없어요." });
          return;
        }
        if (text) registry.write(id, field(body, "raw") === true ? text : pasteOf(text));
        if (field(body, "submit") === true) {
          await wait(SUBMIT_DELAY_MS);
          registry.write(id, "\r");
        }
        respond(response, origin, 200, { ok: true });
        return;
      }

      const screen = SCREEN_PATH.exec(url.pathname);
      if (screen && request.method === "GET") {
        const lines = await registry.screen(decodeURIComponent(screen[1] ?? ""));
        respond(response, origin, lines ? 200 : 404, lines ? { ok: true, lines } : { ok: false, error: "세션이 없어요." });
        return;
      }

      const session = SESSION_PATH.exec(url.pathname);
      if (session && request.method === "DELETE") {
        const closed = registry.close(decodeURIComponent(session[1] ?? ""));
        respond(response, origin, closed ? 200 : 404, closed ? { ok: true } : { ok: false, error: "세션이 없어요." });
        return;
      }

      respond(response, origin, 404, { ok: false, error: "not found" });
    } catch (error) {
      console.error("[runner] request failed", request.method, url.pathname, error);
      respond(response, origin, 500, { ok: false, error: "요청을 처리하지 못했어요." });
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://runner");
    const caller = callerOf({ host: request.headers.host, origin: request.headers.origin }, port, allowedOrigins);
    if (caller === "rejected") {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    if (url.pathname === "/events") {
      sockets.handleUpgrade(request, socket, head, (ws) => {
        ws.on("error", (error) => console.error("[runner] events socket error", error));
        watchers.add(ws);
        send(ws, { type: "sessions", sessions: registry.list() });
        ws.on("close", () => watchers.delete(ws));
      });
      return;
    }

    const terminal = TERMINAL_PATH.exec(url.pathname);
    const id = terminal ? decodeURIComponent(terminal[1] ?? "") : "";
    if (!terminal || !registry.get(id)) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    sockets.handleUpgrade(request, socket, head, (ws) => {
      ws.on("error", (error) => console.error("[runner] terminal socket error", id, error));
      const attachment = registry.attach(id, {
        output: (data) => send(ws, { type: "output", data }),
        exit: (exitCode) => send(ws, { type: "exit", exitCode }),
      });
      if (!attachment) {
        ws.close();
        return;
      }
      if (attachment.scrollback) send(ws, { type: "output", data: attachment.scrollback });
      const current = registry.get(id);
      if (current?.status === "exited") send(ws, { type: "exit", exitCode: current.exitCode ?? 0 });
      ws.on("message", (raw) => {
        const message = parseClientMessage(raw.toString());
        if (message?.type === "input") registry.write(id, message.data);
        if (message?.type === "resize") registry.resize(id, message.cols, message.rows);
      });
      ws.on("close", () => attachment.detach());
    });
  });

  return {
    server,
    broadcast: (message) => watchers.forEach((ws) => send(ws, message)),
  };
}
