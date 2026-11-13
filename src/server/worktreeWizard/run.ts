import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveClaudeBin } from "@/server/intentDiff/AskRunner";
import { describeOrigin } from "./context";
import type { WizardOrigin, WizardTurn, WorktreePlan } from "@/common/worktreeWizard/types";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 3 * 60_000;
const MODEL = process.env.WORKTREE_WIZARD_MODEL ?? "sonnet";

const DASHBOARD_RULES = `You are running inside the Agent Control dashboard, not a terminal.
- Never run commands and never create anything. The dashboard creates the worktree after the user confirms your plan.
- The facts in the first message are complete; do not look anything up.
- Answer only through the structured output.
  - kind "ask": one question in "question", written in Korean. "options" holds up to 4 short answers the user can click (may be empty; they can always type their own).
  - kind "plan": fill every "plan" field. "summary" is one Korean sentence on why these names and this base.
- Prefer "plan" whenever the work is already clear. Ask at most what the skill allows.`;

const SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    kind: { enum: ["ask", "plan"] },
    question: { type: "string" },
    options: { type: "array", items: { type: "string" }, maxItems: 4 },
    plan: {
      type: "object",
      properties: {
        name: { type: "string" },
        branch: { type: "string" },
        baseBranch: { type: "string" },
        parent: { enum: ["from", "none"] },
        reference: { type: ["string", "null"] },
        firstPrompt: { type: "string" },
        summary: { type: "string" },
      },
      required: ["name", "branch", "baseBranch", "parent", "reference", "firstPrompt", "summary"],
    },
  },
  required: ["kind"],
});

// No tools and no MCP servers: the agent only reads the facts it is handed.
const COMMON_ARGS = [
  "--tools",
  "",
  "--strict-mcp-config",
  "--mcp-config",
  '{"mcpServers":{}}',
  "--model",
  MODEL,
  "--append-system-prompt",
  DASHBOARD_RULES,
  "--json-schema",
  SCHEMA,
  "--output-format",
  "json",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toPlan(value: unknown): WorktreePlan | null {
  if (!isRecord(value)) return null;
  const { name, branch, baseBranch, parent, reference, firstPrompt, summary } = value;
  if (typeof name !== "string" || typeof branch !== "string" || typeof baseBranch !== "string") return null;
  return {
    name,
    branch,
    baseBranch,
    parent: parent === "from" ? "from" : "none",
    reference: typeof reference === "string" && reference ? reference : null,
    firstPrompt: typeof firstPrompt === "string" ? firstPrompt : "",
    summary: typeof summary === "string" ? summary : "",
  };
}

function toTurn(output: unknown): WizardTurn | null {
  if (!isRecord(output)) return null;
  if (output.kind === "plan") {
    const plan = toPlan(output.plan);
    return plan ? { kind: "plan", plan } : null;
  }
  if (output.kind === "ask" && typeof output.question === "string") {
    const options = Array.isArray(output.options) ? output.options.filter((option): option is string => typeof option === "string") : [];
    return { kind: "ask", question: output.question, options: options.slice(0, 4) };
  }
  return null;
}

async function execClaude(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(resolveClaudeBin(), [...args, ...COMMON_ARGS], {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const stderr = isRecord(error) && typeof error.stderr === "string" ? error.stderr.trim() : "";
    console.error("[worktree-wizard] claude failed", stderr);
    throw new Error(stderr.split("\n").pop() || "에이전트를 실행하지 못했어요");
  }
}

async function runClaude(cwd: string, args: string[]): Promise<{ sessionId: string; turn: WizardTurn }> {
  const stdout = await execClaude(cwd, args);
  const messages: unknown = JSON.parse(stdout);
  const result = Array.isArray(messages) ? messages.find((message) => isRecord(message) && message.type === "result") : messages;
  if (!isRecord(result) || typeof result.session_id !== "string") throw new Error("에이전트 응답을 읽지 못했어요");
  if (result.is_error === true) throw new Error(typeof result.result === "string" ? result.result : "에이전트가 실패했어요");
  const turn = toTurn(result.structured_output);
  if (!turn) {
    console.error("[worktree-wizard] unexpected output", result.structured_output);
    throw new Error("에이전트가 질문도 구성안도 돌려주지 않았어요");
  }
  return { sessionId: result.session_id, turn };
}

export async function startWizard(origin: WizardOrigin) {
  const facts = await describeOrigin(origin);
  return runClaude(origin.anchorPath, ["-p", `/ac-worktree\n\n${facts}`]);
}

export async function answerWizard(cwd: string, sessionId: string, answer: string) {
  return runClaude(cwd, ["-p", answer, "--resume", sessionId]);
}
