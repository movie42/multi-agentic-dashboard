import { ACTION_PREFIX } from "../../src/common/a2ui/actionText.ts";
import { A2UI_VERSION, CATALOG_ID, COMPONENT_NAMES } from "../../src/common/a2ui/catalog.ts";
import { surfaceIdOf, validateUiMessages } from "../../src/common/a2ui/messages.ts";
import { MCP_SERVER_NAME } from "../orchestration/conductorMcp.ts";

export const RENDER_UI_TOOL = "render_ui";
const PROTOCOL_VERSION = "2025-06-18";

type Reply = Record<string, unknown> | null;
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const EXAMPLE = JSON.stringify([
  { version: A2UI_VERSION, createSurface: { surfaceId: "pickPlan", catalogId: CATALOG_ID } },
  {
    version: A2UI_VERSION,
    updateComponents: {
      surfaceId: "pickPlan",
      components: [
        { id: "root", component: "Column", children: ["title", "optA"] },
        { id: "title", component: "Text", text: "Which plan?" },
        { id: "optA", component: "Option", label: "Plan A", description: "Fast", action: { event: { name: "pick", context: { plan: "A" } } } },
      ],
    },
  },
]);

export const UI_TOOL = {
  name: RENDER_UI_TOOL,
  description: [
    "Show an interactive card (buttons, choices, a form, a table) in the person's Agent Control chat, using A2UI v1.0 messages.",
    `The first message must be createSurface with catalogId "${CATALOG_ID}"; then updateComponents (one component must have id "root") and optionally updateDataModel.`,
    `Components: ${COMPONENT_NAMES.join(", ")}. Option is a choice row (label, description, preview, action); Code is monospace text; Table has columns and rows of strings.`,
    "Component ids must be identifiers (letters, digits, underscore; no hyphens). Children are referenced by id.",
    "A Button has no text of its own: its label is `child`, the id of a Text component.",
    "A Button or Option needs action: {event: {name, context}}. Bind inputs (TextField value, CheckBox value, ChoicePicker value, Option selection) to the data model with {\"@path\": \"/field\"}, set their starting values with updateDataModel, and pass the same bindings in the action context to receive what the person entered.",
    `The tool returns at once. When the person acts, you get a message starting with "${ACTION_PREFIX} surface=<id> name=<event>" followed by the context as JSON. End your turn if you need that answer.`,
    `Example: ${EXAMPLE}`,
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: { messages: { type: "array", items: { type: "object" }, description: "A2UI v1.0 messages, in order." } },
    required: ["messages"],
  },
};

export function uiInstructions(): string {
  return [
    "This session runs inside the Agent Control dashboard. When a choice, a short form or a comparison table would be clearer than prose, show it with the agent-control render_ui tool instead of asking in text.",
    `A reply that starts with "${ACTION_PREFIX}" is the person's answer from such a card.`,
  ].join("\n");
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

export function callUiTool(args: Record<string, unknown>): ToolResult {
  const result = validateUiMessages(args.messages);
  if (!result.ok) return { content: [{ type: "text", text: `The surface was not shown: ${result.error}` }], isError: true };
  const surfaceId = surfaceIdOf(result.messages) ?? "";
  return {
    content: [
      {
        type: "text",
        text: `Shown as surface "${surfaceId}". The person's choice arrives as a message starting with "${ACTION_PREFIX} surface=${surfaceId}".`,
      },
    ],
  };
}

function rpcOf(body: unknown) {
  const raw = record(body);
  if (!raw || typeof raw.method !== "string") return null;
  const id = typeof raw.id === "string" || typeof raw.id === "number" ? raw.id : null;
  return { id, method: raw.method, params: record(raw.params) ?? {} };
}

function isUiCall(rpc: NonNullable<ReturnType<typeof rpcOf>>): boolean {
  return rpc.method === "tools/call" && rpc.params.name === RENDER_UI_TOOL;
}

/** The MCP server an ordinary session sees: render_ui only. */
export async function handleUiMessage(body: unknown): Promise<Reply> {
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
        instructions: uiInstructions(),
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: [UI_TOOL] });
    case "tools/call":
      return isUiCall(rpc) ? reply(callUiTool(record(rpc.params.arguments) ?? {})) : reply({ content: [{ type: "text", text: `Unknown tool ${String(rpc.params.name)}.` }], isError: true });
    default:
      return { jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: `Method not found: ${rpc.method}` } };
  }
}

/** Puts render_ui next to the tools of a conductor's or judge's server. */
export async function withUiTool(body: unknown, inner: (body: unknown) => Promise<Reply> | Reply): Promise<Reply> {
  const rpc = rpcOf(body);
  if (rpc && rpc.id !== null && isUiCall(rpc)) return { jsonrpc: "2.0", id: rpc.id, result: callUiTool(record(rpc.params.arguments) ?? {}) };
  const reply = await inner(body);
  if (rpc?.method !== "tools/list" || !reply) return reply;
  const result = record(reply.result);
  const tools = Array.isArray(result?.tools) ? result.tools : [];
  return { ...reply, result: { ...result, tools: [...tools, UI_TOOL] } };
}
