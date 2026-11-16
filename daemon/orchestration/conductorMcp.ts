import path from "node:path";
import type { ConductorScope } from "../../src/common/orchestration/types.ts";
import type { RunnerLaunchRequest, RunnerPermissionAnswer, RunnerSession } from "../../src/common/runner/types.ts";
import type { OrchestrationStore } from "./OrchestrationStore.ts";

export interface ScopedWorktree {
  path: string;
  branch: string | null;
}

export interface ConductorContext {
  store: OrchestrationStore;
  sessions: {
    list(): RunnerSession[];
    get(id: string): RunnerSession | null;
    launch(request: RunnerLaunchRequest): RunnerSession;
    answerPermission(id: string, requestId: string, answer: RunnerPermissionAnswer): boolean;
  };
  rules: { deliver(sessionId: string, text: string): void; readResult(sessionId: string): Promise<string | null> };
  worktreesOf: (scope: ConductorScope) => Promise<ScopedWorktree[]>;
}

interface JsonRpcRequest {
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const REF = /^(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

const string = (description: string) => ({ type: "string", description });

const TOOLS = [
  {
    name: "list_worktrees",
    description: "Worktrees you may start sessions in (your scope).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_sessions",
    description: "Running sessions inside your scope, with their status and whether they report to you.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "start_session",
    description: "Open a worker session in a worktree with a first prompt. It reports back to you automatically when it stops.",
    inputSchema: {
      type: "object",
      properties: { worktree_path: string("Absolute path from list_worktrees"), prompt: string("The worker's first instruction") },
      required: ["worktree_path", "prompt"],
    },
  },
  {
    name: "send_to_session",
    description: "Send a follow-up instruction to a session in your scope. It is typed in once that session is idle.",
    inputSchema: { type: "object", properties: { session_id: string("Session id"), text: string("Instruction") }, required: ["session_id", "text"] },
  },
  {
    name: "read_result",
    description: "Read a session's latest answer.",
    inputSchema: { type: "object", properties: { session_id: string("Session id") }, required: ["session_id"] },
  },
  {
    name: "propose_worktree",
    description: "Ask for a new worktree. A person confirms it in the dashboard before it is created; the first prompt then opens a worker that reports to you.",
    inputSchema: {
      type: "object",
      properties: {
        name: string("Folder suffix, e.g. COMP-611 or login-redirect"),
        branch: string("New branch, e.g. feat/COMP-611"),
        base_branch: string("Branch to start from"),
        prompt: string("First instruction for the worker that opens there"),
      },
      required: ["name", "branch", "base_branch", "prompt"],
    },
  },
  {
    name: "answer_permission",
    description: "Answer a worker's permission request that was delegated to you.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: string("Worker session id"),
        request_id: string("Permission request id from the message"),
        decision: { type: "string", enum: ["allow", "deny", "ask_human"] },
      },
      required: ["session_id", "request_id", "decision"],
    },
  },
];

const text = (value: string, isError = false): ToolResult => ({ content: [{ type: "text", text: value }], ...(isError ? { isError } : {}) });

function arg(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value.trim() : "";
}

function within(cwd: string, worktrees: ScopedWorktree[]): boolean {
  return worktrees.some((worktree) => cwd === worktree.path || cwd.startsWith(`${worktree.path}/`));
}

async function callTool(conductorId: string, name: string, params: Record<string, unknown>, context: ConductorContext): Promise<ToolResult> {
  const conductor = context.store.conductor(conductorId);
  if (!conductor) return text("이 세션은 지휘자가 아니에요.", true);
  const scoped = await context.worktreesOf(conductor.scope);
  const inScope = (sessionId: string) => {
    const session = context.sessions.get(sessionId);
    return session && session.status !== "exited" && within(session.cwd, scoped) ? session : null;
  };
  switch (name) {
    case "list_worktrees":
      return text(JSON.stringify(scoped, null, 2));
    case "list_sessions": {
      const reportsToMe = new Set(context.store.state().links.filter((link) => link.kind === "report" && link.to === conductorId).map((link) => link.from));
      const listed = context.sessions
        .list()
        .filter((session) => session.id !== conductorId && session.status !== "exited" && within(session.cwd, scoped))
        .map((session) => ({ id: session.id, worktree: session.cwd, status: session.status, reportsToMe: reportsToMe.has(session.id) }));
      return text(JSON.stringify(listed, null, 2));
    }
    case "start_session": {
      const worktreePath = arg(params, "worktree_path");
      const prompt = arg(params, "prompt");
      if (!prompt) return text("prompt가 비었어요.", true);
      const target = scoped.find((worktree) => worktree.path === path.resolve(worktreePath));
      if (!target) return text(`범위 밖의 워크트리예요: ${worktreePath}. list_worktrees로 고르세요.`, true);
      const worker = context.sessions.launch({ cwd: target.path, prompt });
      context.store.addLink({ from: conductorId, to: worker.id, kind: "delegate" }, "conductor");
      context.store.addLink({ from: worker.id, to: conductorId, kind: "report" }, "conductor");
      return text(`세션 ${worker.id}을 ${target.path}에서 열었어요. 끝나면 보고가 들어와요.`);
    }
    case "send_to_session": {
      const sessionId = arg(params, "session_id");
      const message = arg(params, "text");
      if (!inScope(sessionId)) return text("범위 안에 그런 세션이 없어요.", true);
      if (!message) return text("text가 비었어요.", true);
      context.rules.deliver(sessionId, message);
      return text("보냈어요. 그 세션이 쉬는 상태가 되면 입력돼요.");
    }
    case "read_result": {
      const sessionId = arg(params, "session_id");
      if (!inScope(sessionId)) return text("범위 안에 그런 세션이 없어요.", true);
      return text((await context.rules.readResult(sessionId)) ?? "아직 읽을 답이 없어요.");
    }
    case "propose_worktree": {
      const proposal = { name: arg(params, "name"), branch: arg(params, "branch"), baseBranch: arg(params, "base_branch"), prompt: arg(params, "prompt") };
      if (!NAME.test(proposal.name) || !REF.test(proposal.branch) || !REF.test(proposal.baseBranch)) return text("이름이나 브랜치 모양이 올바르지 않아요.", true);
      const created = context.store.addProposal({ conductorId, ...proposal });
      return text(`워크트리 제안(${created.id})을 올렸어요. 사람이 대시보드에서 확인하면 만들어지고, 그곳에 연 세션이 보고해요.`);
    }
    case "answer_permission": {
      const sessionId = arg(params, "session_id");
      const requestId = arg(params, "request_id");
      const decision = arg(params, "decision");
      const permission = context.sessions.get(sessionId)?.permission;
      if (!permission || permission.id !== requestId || permission.delegatedTo !== conductorId) return text("나에게 맡겨진 그 권한 요청이 없어요(이미 답했을 수 있어요).", true);
      if (decision === "ask_human") return text("사람에게 남겨 뒀어요. 대시보드 카드에서 답할 거예요.");
      const answer: RunnerPermissionAnswer =
        decision === "allow" ? { behavior: "allow", suggestionIndex: null } : { behavior: "deny", message: "The conductor session denied this request." };
      return context.sessions.answerPermission(sessionId, requestId, answer) ? text("답했어요.") : text("답하지 못했어요. 이미 끝난 요청이에요.", true);
    }
    default:
      return text(`모르는 도구예요: ${name}`, true);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

function requestOf(value: unknown): JsonRpcRequest | null {
  const raw = record(value);
  if (!raw || typeof raw.method !== "string") return null;
  const id = raw.id;
  return {
    method: raw.method,
    ...(typeof id === "string" || typeof id === "number" || id === null ? { id } : {}),
    ...(record(raw.params) ? { params: record(raw.params) ?? {} } : {}),
  };
}

/**
 * One MCP (Streamable HTTP) message from a conductor session, answered with plain JSON. Returns null for
 * notifications, which get no reply.
 */
export async function handleMcpMessage(conductorId: string, body: unknown, context: ConductorContext): Promise<unknown | null> {
  const request = requestOf(body);
  if (!request) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  if (request.id === undefined) return null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: request.id, result });
  const params = request.params ?? {};
  switch (request.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return reply({
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "agent-control-conductor", version: "1.0.0" },
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      try {
        return reply(await callTool(conductorId, name, record(params.arguments) ?? {}, context));
      } catch (error) {
        console.error("[orchestration] tool failed", name, error);
        return reply(text(error instanceof Error ? error.message : String(error), true));
      }
    }
    default:
      return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } };
  }
}
