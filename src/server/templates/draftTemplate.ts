import "server-only";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { resolveClaudeBin } from "@/server/intentDiff/AskRunner";
import { CARD_KINDS, templateOf, type WorkflowTemplate } from "@/common/templates/types";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 3 * 60_000;
const MODEL = process.env.TEMPLATE_DRAFT_MODEL ?? "sonnet";
const MAX_EXAMPLES = 8;

const RULES = `You turn a one-line description of a Claude Code workflow into a workflow template for the Agent Control dashboard.
- Never run commands. Answer only through the structured output.
- A template is an ordered list of cards. Each card becomes a Claude Code session in one git worktree, top to bottom.
- kind "work": does the job in its prompt; when it ends the run moves to the next card (or along its single outgoing route).
- kind "judge": a cheap session (model "sonnet", effort "low") that reads the previous result and picks one outgoing route by its label. Use one only where the flow branches on a result, e.g. a review that either passes or sends the work back.
- routes: from/to are card keys. Give every card except the last its outgoing route(s). A judge card needs two or more routes, each with a short Korean label such as "통과" or "고칠 것 있음". Routes from work cards have label null.
- continueFrom: true sends the prompt into the previous card's session instead of opening a new one (keeps its memory). Never true right after a judge card.
- pauseAfter: true stops after the card so a person confirms before the next card (plan approval, before opening a PR).
- check: a shell command run in the worktree after each turn; the card moves on only when it exits 0. Use null unless the description names one.
- model: null, "sonnet", "opus" or "haiku". effort: null, "low", "medium", "high" or "xhigh". Use null unless there is a reason.
- The dashboard puts the task description at the top of every prompt, so a prompt must not start with a slash command. Name a skill in words instead ("flow 스킬로 …").
- Write name, titles, prompts and labels in Korean. Keys are short lowercase ASCII words.
- When one of the existing templates is close to the description, start from it and change only what the description asks.`;

const SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    name: { type: "string" },
    cards: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          prompt: { type: "string" },
          kind: { enum: [...CARD_KINDS] },
          model: { type: ["string", "null"] },
          effort: { type: ["string", "null"] },
          continueFrom: { type: "boolean" },
          pauseAfter: { type: "boolean" },
          check: { type: ["string", "null"] },
        },
        required: ["key", "title", "prompt", "kind", "model", "effort", "continueFrom", "pauseAfter", "check"],
      },
    },
    routes: {
      type: "array",
      items: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" }, label: { type: ["string", "null"] } },
        required: ["from", "to", "label"],
      },
    },
  },
  required: ["name", "cards", "routes"],
});

const ARGS = [
  "--tools",
  "",
  "--strict-mcp-config",
  "--mcp-config",
  '{"mcpServers":{}}',
  "--model",
  MODEL,
  "--append-system-prompt",
  RULES,
  "--json-schema",
  SCHEMA,
  "--output-format",
  "json",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function draftPrompt(description: string, examples: WorkflowTemplate[]): string {
  const shown = examples.slice(0, MAX_EXAMPLES).map(({ name, cards, routes }) => ({ name, cards, routes: routes.map(({ from, to, label }) => ({ from, to, label })) }));
  return [`설명: ${description.trim()}`, shown.length > 0 ? `지금 있는 템플릿:\n${JSON.stringify(shown)}` : ""].filter(Boolean).join("\n\n");
}

export function draftFromOutput(stdout: string, id: string): WorkflowTemplate {
  const messages: unknown = JSON.parse(stdout);
  const result = Array.isArray(messages) ? messages.find((message) => isRecord(message) && message.type === "result") : messages;
  if (!isRecord(result)) throw new Error("에이전트 응답을 읽지 못했어요");
  if (result.is_error === true) throw new Error(typeof result.result === "string" ? result.result : "에이전트가 실패했어요");
  const output = result.structured_output;
  const routes = isRecord(output) && Array.isArray(output.routes) ? output.routes : [];
  const template = templateOf({
    ...(isRecord(output) ? output : {}),
    id,
    routes: routes.map((route: unknown, index: number) => ({ ...(isRecord(route) ? route : {}), id: `r${index + 1}` })),
    updatedAt: 0,
  });
  if (!template) {
    console.error("[template-draft] unexpected output", output);
    throw new Error("에이전트가 카드를 만들지 못했어요");
  }
  return template;
}

export async function draftTemplate(description: string, examples: WorkflowTemplate[]): Promise<WorkflowTemplate> {
  try {
    const { stdout } = await execFileAsync(resolveClaudeBin(), ["-p", draftPrompt(description, examples), ...ARGS], {
      cwd: homedir(),
      timeout: TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
    return draftFromOutput(stdout, `t-${randomUUID().slice(0, 8)}`);
  } catch (error) {
    const stderr = isRecord(error) && typeof error.stderr === "string" ? error.stderr.trim() : "";
    if (stderr) console.error("[template-draft] claude failed", stderr);
    if (stderr || !(error instanceof Error)) throw new Error(stderr.split("\n").pop() || "에이전트를 실행하지 못했어요");
    throw error;
  }
}
