import { isAbsolute } from "node:path";
import type { RunnerLaunchRequest, RunnerPermissionAnswer, RunnerSession } from "../../src/common/runner/types.ts";
import { isDelegated } from "./grants.ts";
import type { Orchestration } from "./Orchestration.ts";

export const MCP_SERVER_NAME = "agent-control";
const PROTOCOL_VERSION = "2025-06-18";

export interface ConductorToolDeps {
  orchestration: Orchestration;
  list: () => RunnerSession[];
  get: (id: string) => RunnerSession | null;
  launch: (request: RunnerLaunchRequest) => RunnerSession;
  answerPermission: (id: string, requestId: string, answer: RunnerPermissionAnswer) => boolean;
  isDirectory: (path: string) => Promise<boolean>;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const str = (description: string) => ({ type: "string", description });

export const CONDUCTOR_TOOLS: ToolDefinition[] = [
  {
    name: "list_sessions",
    description: "List the Agent Control sessions inside your scope: id, folder, status (idle/working/waiting/exited), who delegated it, and pending permission requests.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "start_session",
    description:
      "Open a new Claude Code worker session in a worktree folder inside your scope and give it its first request. The worker reports back to you automatically each time it finishes a turn.",
    inputSchema: {
      type: "object",
      properties: { cwd: str("Absolute worktree folder, inside your scope"), prompt: str("The worker's first request") },
      required: ["cwd", "prompt"],
    },
  },
  {
    name: "send_to_session",
    description: "Send a follow-up message to a session in your scope. If it is busy, the message waits until its current turn ends.",
    inputSchema: {
      type: "object",
      properties: { session_id: str("Target session id"), text: str("Message to send") },
      required: ["session_id", "text"],
    },
  },
  {
    name: "read_result",
    description: "Read a session's status and its last answer.",
    inputSchema: { type: "object", properties: { session_id: str("Session id") }, required: ["session_id"] },
  },
  {
    name: "link_sessions",
    description:
      "Connect two sessions in your scope: kind 'report' sends the source's last answer to the target whenever the source finishes a turn; kind 'next' sends the target `prompt` (plus the source's last answer) when the source finishes.",
    inputSchema: {
      type: "object",
      properties: {
        from: str("Source session id"),
        to: str("Target session id"),
        kind: { type: "string", enum: ["report", "next"] },
        prompt: str("For 'next': what the target should do"),
      },
      required: ["from", "to", "kind"],
    },
  },
  {
    name: "request_worktree",
    description:
      "Ask the person to create a new git worktree for you. Nothing is created until they confirm on the dashboard; you get a message with the new folder (or the refusal) afterwards.",
    inputSchema: {
      type: "object",
      properties: { branch: str("New branch name"), base: str("Branch to start from (optional)"), reason: str("Why it is needed, one sentence") },
      required: ["branch", "reason"],
    },
  },
  {
    name: "answer_permission",
    description:
      "Answer a permission request a worker forwarded to you. 'allow' approves it. 'pass' leaves it to the person — use it whenever the request goes beyond the work you handed out or you are not sure.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: str("Worker session id"),
        request_id: str("Permission request id from the forwarded message"),
        decision: { type: "string", enum: ["allow", "pass"] },
      },
      required: ["session_id", "request_id", "decision"],
    },
  },
];

export function conductorInstructions(): string {
  return [
    "You are a conductor session in Agent Control. You plan the work and hand it to worker sessions with the agent-control MCP tools instead of doing it all yourself.",
    "- start_session opens a worker in a worktree inside your scope; it reports its last answer back to you whenever it finishes a turn.",
    "- Messages that start with [Agent Control] come from the dashboard daemon (worker reports, forwarded permission requests, worktree results), not from the person.",
    "- Forwarded permission requests: answer with answer_permission. Allow only what fits the work you handed out; otherwise pass it to the person.",
    "- Need a new worktree? Use request_worktree; the person confirms it first.",
  ].join("\n");
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

function arg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function summary(session: RunnerSession, deps: ConductorToolDeps) {
  return {
    id: session.id,
    cwd: session.cwd,
    kind: session.kind,
    status: session.status,
    delegatedBy: deps.orchestration.parentOf(session.id),
    permission: session.permission ? { request_id: session.permission.id, tool: session.permission.toolName } : null,
  };
}

export async function callConductorTool(conductorId: string, name: string, args: Record<string, unknown>, deps: ConductorToolDeps): Promise<ToolResult> {
  const { orchestration } = deps;
  const conductor = orchestration.conductor(conductorId);
  if (!conductor) return fail("This session is not a conductor.");
  const inScopeSession = (id: string): RunnerSession | null => {
    const session = deps.get(id);
    return session && id !== conductorId && orchestration.inScope(conductorId, session.cwd) ? session : null;
  };

  switch (name) {
    case "list_sessions": {
      const sessions = deps.list().filter((session) => session.id !== conductorId && orchestration.inScope(conductorId, session.cwd));
      return ok(JSON.stringify({ scope: conductor.scope, sessions: sessions.map((session) => summary(session, deps)) }, null, 2));
    }
    case "start_session": {
      const cwd = arg(args, "cwd");
      const prompt = arg(args, "prompt");
      if (!prompt) return fail("prompt is required.");
      if (!isAbsolute(cwd) || !orchestration.inScope(conductorId, cwd)) {
        return fail(`${cwd || "(empty)"} is outside your scope. Allowed folders: ${conductor.scope.paths.join(", ")}. Use request_worktree for a new one.`);
      }
      if (!(await deps.isDirectory(cwd))) return fail(`${cwd} does not exist.`);
      const worker = deps.launch({ cwd, prompt, askPermissions: true });
      orchestration.connect(conductorId, worker.id, "delegate");
      orchestration.connect(worker.id, conductorId, "report");
      return ok(`Started worker ${worker.id} in ${cwd}. It will report back when it finishes a turn.`);
    }
    case "send_to_session": {
      const target = inScopeSession(arg(args, "session_id"));
      const text = arg(args, "text");
      if (!target) return fail("No such session in your scope.");
      if (!text) return fail("text is required.");
      const queued = target.status !== "idle" || target.permission !== null;
      if (!orchestration.deliver(target.id, text, null)) return fail("The session has exited.");
      return ok(queued ? `Session ${target.id} is busy; the message is queued until its turn ends.` : `Sent to ${target.id}.`);
    }
    case "read_result": {
      const target = inScopeSession(arg(args, "session_id"));
      if (!target) return fail("No such session in your scope.");
      return ok(JSON.stringify({ ...summary(target, deps), lastAnswer: orchestration.lastAnswer(target.id) }, null, 2));
    }
    case "link_sessions": {
      const kind = arg(args, "kind");
      const from = inScopeSession(arg(args, "from")) ?? (arg(args, "from") === conductorId ? deps.get(conductorId) : null);
      const to = inScopeSession(arg(args, "to")) ?? (arg(args, "to") === conductorId ? deps.get(conductorId) : null);
      if (kind !== "report" && kind !== "next") return fail("kind must be 'report' or 'next'.");
      if (!from || !to) return fail("Both sessions must be in your scope.");
      const link = orchestration.connect(from.id, to.id, kind, arg(args, "prompt") || null);
      return link ? ok(`Linked ${from.id} -> ${to.id} (${kind}).`) : fail("Could not link these sessions.");
    }
    case "request_worktree": {
      const branch = arg(args, "branch");
      const reason = arg(args, "reason");
      if (!/^[\w./-]{1,120}$/.test(branch)) return fail("branch must be a plain branch name.");
      if (!reason) return fail("reason is required.");
      if (conductor.worktreeRequest) return fail("A worktree request is already waiting for the person.");
      orchestration.requestWorktree(conductorId, { branch, base: arg(args, "base") || null, reason });
      return ok("Asked the person on the dashboard. You will get a message when they confirm or decline.");
    }
    case "answer_permission": {
      const target = inScopeSession(arg(args, "session_id"));
      const permission = target?.permission;
      if (!target || !permission || permission.id !== arg(args, "request_id")) return fail("That permission request is no longer pending.");
      if (orchestration.parentOf(target.id) !== conductorId) return fail("Only the conductor that delegated this worker can answer.");
      if (arg(args, "decision") !== "allow") return ok("Left to the person.");
      const input = { toolName: permission.toolName, toolInput: permission.toolInput, suggestions: permission.suggestions };
      if (!isDelegated(conductor, input)) return fail("This request is outside what the person delegated to you; it stays with the person.");
      const answered = deps.answerPermission(target.id, permission.id, { behavior: "allow", suggestionIndex: null });
      return answered ? ok("Allowed.") : fail("That permission request is no longer pending.");
    }
    default:
      return fail(`Unknown tool ${name}.`);
  }
}

interface JsonRpcRequest {
  id: string | number | null;
  method: string;
  params: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

function rpcOf(body: unknown): JsonRpcRequest | null {
  const raw = record(body);
  if (!raw || typeof raw.method !== "string") return null;
  const id = typeof raw.id === "string" || typeof raw.id === "number" ? raw.id : null;
  return { id, method: raw.method, params: record(raw.params) ?? {} };
}

/**
 * One MCP JSON-RPC message over the Streamable HTTP transport, answered as plain JSON.
 * Returns null for notifications, which get an empty 202.
 */
export async function handleMcpMessage(conductorId: string, body: unknown, deps: ConductorToolDeps): Promise<Record<string, unknown> | null> {
  const rpc = rpcOf(body);
  if (!rpc) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  if (rpc.id === null) return null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: rpc.id, result });
  switch (rpc.method) {
    case "initialize": {
      const requested = rpc.params.protocolVersion;
      return reply({
        protocolVersion: typeof requested === "string" ? requested : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: MCP_SERVER_NAME, version: "1.0.0" },
        instructions: conductorInstructions(),
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: CONDUCTOR_TOOLS });
    case "tools/call": {
      const name = typeof rpc.params.name === "string" ? rpc.params.name : "";
      return reply(await callConductorTool(conductorId, name, record(rpc.params.arguments) ?? {}, deps));
    }
    default:
      return { jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: `Method not found: ${rpc.method}` } };
  }
}
