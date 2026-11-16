import type { TemplateRuns } from "./TemplateRuns.ts";

const PROTOCOL_VERSION = "2025-06-18";

export function judgeInstructions(): string {
  return [
    "You are a judge card in an Agent Control workflow template. Read what the previous card produced, decide, and pick exactly one route.",
    "- Call choose_route once with the route that fits and a one-sentence reason, then end your turn.",
    "- You cannot open sessions or send messages; the template moves the work along the route you pick.",
  ].join("\n");
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

export function judgeTools(sessionId: string, runs: TemplateRuns) {
  const labels = runs.judgeRoutes(sessionId).map((route) => route.label ?? route.to);
  return [
    {
      name: "choose_route",
      description: "Pick the route the workflow takes after this judge card. Choose one of the listed routes.",
      inputSchema: {
        type: "object",
        properties: {
          route: labels.length > 0 ? { type: "string", enum: labels } : { type: "string", description: "Route label" },
          reason: { type: "string", description: "Why this route, one sentence" },
        },
        required: ["route", "reason"],
      },
    },
  ];
}

export function callJudgeTool(sessionId: string, name: string, args: Record<string, unknown>, runs: TemplateRuns): ToolResult {
  if (name !== "choose_route") return { content: [{ type: "text", text: `Unknown tool ${name}.` }], isError: true };
  const route = typeof args.route === "string" ? args.route : "";
  const reason = typeof args.reason === "string" ? args.reason : "";
  const result = runs.choose(sessionId, route, reason);
  return result.ok
    ? { content: [{ type: "text", text: `Picked '${route}'. End your turn now; the workflow continues along it.` }] }
    : { content: [{ type: "text", text: result.error }], isError: true };
}

export function handleJudgeMessage(sessionId: string, body: unknown, runs: TemplateRuns): Record<string, unknown> | null {
  const raw = record(body);
  if (!raw || typeof raw.method !== "string") return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  const id = typeof raw.id === "string" || typeof raw.id === "number" ? raw.id : null;
  if (id === null) return null;
  const params = record(raw.params) ?? {};
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  switch (raw.method) {
    case "initialize":
      return reply({
        protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "agent-control", version: "1.0.0" },
        instructions: judgeInstructions(),
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: judgeTools(sessionId, runs) });
    case "tools/call":
      return reply(callJudgeTool(sessionId, typeof params.name === "string" ? params.name : "", record(params.arguments) ?? {}, runs));
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${raw.method}` } };
  }
}
