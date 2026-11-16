import { stat } from "node:fs/promises";
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { GRANT_BUNDLES, LINK_KINDS, type ConductorLaunch } from "../src/common/orchestration/types.ts";
import {
  RUNNER_HOOK_EVENTS,
  type RunnerHookEvent,
  type RunnerLaunchRequest,
  type RunnerSession,
  type SessionsMessage,
  type TerminalClientMessage,
  type TerminalServerMessage,
} from "../src/common/runner/types.ts";
import { callerOf } from "./guard.ts";
import { handleMcpMessage, type ConductorToolDeps } from "./orchestration/conductorMcp.ts";
import { describePermission, isDelegated, ruleFor } from "./orchestration/grants.ts";
import { lastAnswerOf } from "./orchestration/lastAnswer.ts";
import type { Orchestration } from "./orchestration/Orchestration.ts";
import { handleJudgeMessage } from "./templates/judgeMcp.ts";
import type { TemplateRuns } from "./templates/TemplateRuns.ts";
import type { TemplateStore } from "./templates/TemplateStore.ts";
import { DICTATION_HANDLE, type Dictation } from "./session/Dictation.ts";
import { answerOf, permissionInputOf, type PermissionRequestInput } from "./session/permissions.ts";
import { parseStatusLine } from "./session/statusLine.ts";
import type { SessionRegistry } from "./session/SessionRegistry.ts";

export interface RunnerServerOptions {
  registry: SessionRegistry;
  orchestration: Orchestration;
  runs: TemplateRuns;
  templates: TemplateStore;
  dictation: Dictation;
  port: number;
  allowedOrigins: readonly string[];
  readAnswer?: (body: unknown) => Promise<string | null>;
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
const DELEGATE_PATH = /^\/sessions\/([^/]+)\/delegate$/;
const MCP_PATH = /^\/mcp\/([^/]+)$/;
const LINK_PATH = /^\/links\/([^/]+)$/;
const LINK_RESUME_PATH = /^\/links\/([^/]+)\/resume$/;
const WORKTREE_REQUEST_PATH = /^\/conductors\/([^/]+)\/worktree$/;
const TEMPLATE_PATH = /^\/templates\/([^/]+)$/;
const RUN_PATH = /^\/runs\/([^/]+)$/;
const RUN_ACTION_PATH = /^\/runs\/([^/]+)\/(start|continue|retry|stop)$/;

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

export function conductorLaunchOf(value: unknown): ConductorLaunch | null {
  const scope = field(value, "scope");
  const kind = field(scope, "kind");
  const root = field(scope, "root");
  const paths = field(scope, "paths");
  const grants = field(value, "grants");
  if (kind !== "project" && kind !== "worktree") return null;
  if (typeof root !== "string" || !root.startsWith("/") || !Array.isArray(paths)) return null;
  const folders = paths.filter((item): item is string => typeof item === "string" && item.startsWith("/"));
  return {
    scope: { kind, root, paths: folders.includes(root) ? folders : [root, ...folders] },
    grants: Array.isArray(grants) ? GRANT_BUNDLES.filter((bundle) => grants.includes(bundle)) : [],
  };
}

function launchRequestOf(body: unknown): RunnerLaunchRequest | null {
  const cwd = field(body, "cwd");
  const prompt = field(body, "prompt");
  const resumeSessionId = field(body, "resumeSessionId");
  const kind = field(body, "kind");
  const conductor = conductorLaunchOf(field(body, "conductor"));
  if (typeof cwd !== "string" || !cwd.startsWith("/")) return null;
  return {
    cwd,
    kind: kind === "shell" ? "shell" : "claude",
    ...(typeof prompt === "string" && prompt.trim() ? { prompt } : {}),
    ...(typeof resumeSessionId === "string" && SESSION_ID.test(resumeSessionId) ? { resumeSessionId } : {}),
    ...(conductor && kind !== "shell" ? { conductor } : {}),
  };
}

export function forwardedPermissionText(worker: RunnerSession, requestId: string, input: PermissionRequestInput): string {
  return [
    `[Agent Control] 맡긴 세션 ${worker.id} (${worker.cwd})이 권한을 요청했어요.`,
    `요청: ${describePermission(input)}`,
    `맡긴 일에 맞으면 answer_permission(session_id: "${worker.id}", request_id: "${requestId}", decision: "allow"), 아니면 decision: "pass"로 사람에게 넘겨 주세요.`,
  ].join("\n");
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

export function createRunnerServer({ registry, orchestration, runs, templates, dictation, port, allowedOrigins, readAnswer = lastAnswerOf }: RunnerServerOptions): RunnerServer {
  const sockets = new WebSocketServer({ noServer: true });
  const watchers = new Set<WebSocket>();
  const view = () => orchestration.decorate(registry.list());
  const toolDeps: ConductorToolDeps = {
    orchestration,
    list: () => registry.list(),
    get: (id) => registry.get(id),
    launch: (request) => registry.launch(request),
    answerPermission: (id, requestId, answer) => registry.answerPermission(id, requestId, answer),
    isDirectory,
  };

  /** The conductor that should see this worker's request first, when it falls inside what a person delegated. */
  const delegateOf = (id: string, input: PermissionRequestInput): string | null => {
    const parent = orchestration.parentOf(id);
    const conductor = parent ? orchestration.conductor(parent) : null;
    return parent && conductor && isDelegated(conductor, input) ? parent : null;
  };

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
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE",
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
        const delegate = input ? delegateOf(id, input) : null;
        if (!input || (watchers.size === 0 && !delegate)) {
          respond(response, undefined, 200, {});
          return;
        }
        const pending = registry.holdPermission(id, input, delegate);
        const worker = registry.get(id);
        const requestId = worker?.permission?.id ?? null;
        if (delegate && worker && requestId) orchestration.deliver(delegate, forwardedPermissionText(worker, requestId, input), null);
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
        const [, rawId = "", event = ""] = hook;
        const id = decodeURIComponent(rawId);
        if (isHookEvent(event)) {
          const notificationType = field(body, "notification_type");
          const conversationId = field(body, "session_id");
          registry.signal(id, {
            event,
            notificationType: typeof notificationType === "string" ? notificationType : null,
            conversationId: typeof conversationId === "string" && conversationId ? conversationId : null,
          });
          if (event === "UserPromptSubmit") orchestration.onPrompt(id);
        }
        // Lines fire before the hook returns, so a prompt the next turn submits cannot reach onPrompt ahead of onStop.
        if (event === "Stop") {
          try {
            const answer = await readAnswer(body);
            orchestration.onStop(id, answer);
            runs.onStop(id, answer).catch((error: unknown) => console.warn("[runner] template run stop failed", id, error));
          } catch (error) {
            console.warn("[runner] stop lines failed", id, error);
          }
        }
        respond(response, undefined, 200, {});
        return;
      }

      const mcp = MCP_PATH.exec(url.pathname);
      if (mcp) {
        const id = decodeURIComponent(mcp[1] ?? "");
        if (request.method !== "POST") {
          response.writeHead(405, { Allow: "POST" }).end();
          return;
        }
        if (!orchestration.isConductor(id) && runs.isJudge(id)) {
          const reply = handleJudgeMessage(id, await readBody(request), runs);
          if (reply) respond(response, undefined, 200, reply);
          else response.writeHead(202).end();
          return;
        }
        if (!orchestration.isConductor(id)) {
          respond(response, undefined, 404, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "not a conductor session" } });
          return;
        }
        const reply = await handleMcpMessage(id, await readBody(request), toolDeps);
        if (reply) respond(response, undefined, 200, reply);
        else response.writeHead(202).end();
        return;
      }

      if (url.pathname === "/sessions" && request.method === "GET") {
        respond(response, origin, 200, { ok: true, sessions: view() });
        return;
      }

      if (url.pathname === "/sessions" && request.method === "POST") {
        const launch = launchRequestOf(await readBody(request));
        if (!launch || !(await isDirectory(launch.cwd))) {
          respond(response, origin, 400, { ok: false, error: "폴더를 찾을 수 없어요. 절대 경로를 입력해 주세요." });
          return;
        }
        const session = registry.launch(launch);
        if (launch.conductor) orchestration.addConductor(session.id, launch.conductor);
        respond(response, origin, 200, { ok: true, session: orchestration.decorate([session])[0] ?? session });
        return;
      }

      if (url.pathname === "/links" && request.method === "POST") {
        const body = await readBody(request);
        const from = field(body, "from");
        const to = field(body, "to");
        const kind = LINK_KINDS.find((item) => item === field(body, "kind"));
        const prompt = field(body, "prompt");
        const link =
          typeof from === "string" && typeof to === "string" && kind
            ? orchestration.connect(from, to, kind, typeof prompt === "string" && prompt.trim() ? prompt : null)
            : null;
        respond(response, origin, link ? 200 : 400, link ? { ok: true } : { ok: false, error: "두 세션을 이을 수 없어요." });
        return;
      }

      const linkResume = LINK_RESUME_PATH.exec(url.pathname);
      if (linkResume && request.method === "POST") {
        const resumed = orchestration.resume(decodeURIComponent(linkResume[1] ?? ""));
        respond(response, origin, resumed ? 200 : 404, resumed ? { ok: true } : { ok: false, error: "선이 없어요." });
        return;
      }

      const link = LINK_PATH.exec(url.pathname);
      if (link && request.method === "PATCH") {
        const prompt = field(await readBody(request), "prompt");
        const edited = orchestration.edit(decodeURIComponent(link[1] ?? ""), typeof prompt === "string" ? prompt : null);
        respond(response, origin, edited ? 200 : 400, edited ? { ok: true } : { ok: false, error: "선 내용을 고칠 수 없어요." });
        return;
      }
      if (link && request.method === "DELETE") {
        const removed = orchestration.disconnect(decodeURIComponent(link[1] ?? ""));
        respond(response, origin, removed ? 200 : 404, removed ? { ok: true } : { ok: false, error: "선이 없어요." });
        return;
      }

      const delegate = DELEGATE_PATH.exec(url.pathname);
      if (delegate && request.method === "POST") {
        const id = decodeURIComponent(delegate[1] ?? "");
        const worker = registry.get(id);
        const permission = worker?.permission;
        const parent = orchestration.parentOf(id);
        if (!worker || !permission || permission.id !== field(await readBody(request), "requestId") || !parent) {
          respond(response, origin, 409, { ok: false, error: "지휘자에게 맡길 수 있는 권한 요청이 아니에요." });
          return;
        }
        const input = { toolName: permission.toolName, toolInput: permission.toolInput, suggestions: permission.suggestions };
        const rule = ruleFor(input);
        if (!rule || !orchestration.addRule(parent, rule)) {
          respond(response, origin, 409, { ok: false, error: "이 요청은 지휘자에게 맡길 수 없어요." });
          return;
        }
        orchestration.deliver(parent, forwardedPermissionText(worker, permission.id, input), null);
        respond(response, origin, 200, { ok: true });
        return;
      }

      const worktreeRequest = WORKTREE_REQUEST_PATH.exec(url.pathname);
      if (worktreeRequest && request.method === "POST") {
        const body = await readBody(request);
        const requestId = field(body, "requestId");
        const created = field(body, "path");
        const error = field(body, "error");
        const conductorId = decodeURIComponent(worktreeRequest[1] ?? "");
        const folder = typeof created === "string" && created.startsWith("/") ? created : null;
        const settled =
          typeof requestId === "string" ? orchestration.settleWorktree(conductorId, requestId, folder, typeof error === "string" ? error : undefined) : null;
        if (settled?.prompt && folder) {
          const worker = registry.launch({ cwd: folder, prompt: settled.prompt, askPermissions: true });
          orchestration.connect(conductorId, worker.id, "delegate");
          orchestration.connect(worker.id, conductorId, "report");
        }
        respond(response, origin, settled ? 200 : 409, settled ? { ok: true } : { ok: false, error: "이미 처리한 워크트리 요청이에요." });
        return;
      }

      if (url.pathname === "/templates" && request.method === "GET") {
        respond(response, origin, 200, { ok: true, templates: await templates.list() });
        return;
      }

      if (url.pathname === "/templates" && request.method === "POST") {
        const template = await templates.save(await readBody(request));
        respond(response, origin, template ? 200 : 400, template ? { ok: true, template } : { ok: false, error: "카드가 하나 이상 있는 템플릿만 저장할 수 있어요." });
        return;
      }

      const template = TEMPLATE_PATH.exec(url.pathname);
      if (template && request.method === "DELETE") {
        const removed = await templates.remove(decodeURIComponent(template[1] ?? ""));
        respond(response, origin, removed ? 200 : 404, removed ? { ok: true } : { ok: false, error: "템플릿이 없어요." });
        return;
      }

      if (url.pathname === "/runs" && request.method === "GET") {
        respond(response, origin, 200, { ok: true, runs: runs.list() });
        return;
      }

      if (url.pathname === "/runs" && request.method === "POST") {
        const body = await readBody(request);
        const templateId = field(body, "templateId");
        const cwd = field(body, "cwd");
        const intent = field(body, "intent");
        const found = typeof templateId === "string" ? await templates.get(templateId) : null;
        if (!found || typeof cwd !== "string" || !cwd.startsWith("/") || !(await isDirectory(cwd))) {
          respond(response, origin, 400, { ok: false, error: "템플릿이나 워크트리 폴더를 찾지 못했어요." });
          return;
        }
        const expanded = runs.expand(found, cwd, typeof intent === "string" ? intent : "");
        const result = expanded.ok && field(body, "start") === true ? runs.start(expanded.run.id) : expanded;
        respond(response, origin, result.ok ? 200 : 409, result.ok ? { ok: true, run: result.run } : { ok: false, error: result.error });
        return;
      }

      const runAction = RUN_ACTION_PATH.exec(url.pathname);
      if (runAction && request.method === "POST") {
        const runId = decodeURIComponent(runAction[1] ?? "");
        const body = await readBody(request);
        const routeId = field(body, "routeId");
        const text = field(body, "text");
        const action = runAction[2];
        const result =
          action === "start"
            ? runs.start(runId)
            : action === "continue"
              ? runs.continue(runId, typeof routeId === "string" ? routeId : null)
              : action === "retry"
                ? runs.retry(runId, typeof text === "string" ? text : "")
                : runs.stop(runId);
        respond(response, origin, result.ok ? 200 : 409, result.ok ? { ok: true, run: result.run } : { ok: false, error: result.error });
        return;
      }

      const run = RUN_PATH.exec(url.pathname);
      if (run && request.method === "DELETE") {
        const removed = runs.remove(decodeURIComponent(run[1] ?? ""));
        respond(response, origin, removed ? 200 : 404, removed ? { ok: true } : { ok: false, error: "펼친 템플릿이 없어요." });
        return;
      }

      if (url.pathname === "/dictation" && request.method === "POST") {
        try {
          await dictation.ensure();
          respond(response, origin, 200, { ok: true, handle: DICTATION_HANDLE });
        } catch (error) {
          console.error("[dictation] start failed", error);
          respond(response, origin, 503, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      const input = INPUT_PATH.exec(url.pathname);
      if (input && request.method === "POST") {
        const id = decodeURIComponent(input[1] ?? "");
        const body = await readBody(request);
        const text = field(body, "text");
        if (id === DICTATION_HANDLE) {
          const written = typeof text === "string" && dictation.write(text);
          respond(response, origin, written ? 200 : 404, written ? { ok: true } : { ok: false, error: "받아쓰기 세션이 없어요." });
          return;
        }
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
        const screenId = decodeURIComponent(screen[1] ?? "");
        const lines = screenId === DICTATION_HANDLE ? await dictation.screen() : await registry.screen(screenId);
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
        send(ws, { type: "sessions", sessions: view(), runs: runs.list() });
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
