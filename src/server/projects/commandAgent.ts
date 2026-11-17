import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  COMMAND_LINE_LIMIT,
  COMMAND_NAME_LIMIT,
  MAX_PROJECT_COMMANDS,
  projectCommandSchema,
  type CommandProposal,
  type ProjectCommand,
} from "@/common/appStatus/types";
import { resolveClaudeBin } from "@/server/intentDiff/AskRunner";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 4 * 60_000;
const MODEL = process.env.COMMAND_AGENT_MODEL ?? "sonnet";

const RULES = `You find the shell commands a developer runs to build, run or reinstall the project in the current folder, for buttons on the Agent Control dashboard.
- Read the project's own files (package.json scripts, lockfiles, Makefile, justfile, eas.json, app.json, Cargo.toml, pyproject.toml, README) with Read, Grep and Glob. Never run anything.
- Each command runs from the repository root in a login shell when a person presses its button, and its output shows in a terminal.
- Give each command a short Korean name (at most ${COMMAND_NAME_LIMIT} characters) such as "빌드", "개발 모드", "앱 재설치", and one shell line (at most ${COMMAND_LINE_LIMIT} characters, no line breaks).
- Use the package manager the project uses, judged from its lockfile (bun.lock → bun, yarn.lock → yarn, pnpm-lock.yaml → pnpm, package-lock.json → npm).
- Prefer the project's own scripts ("bun run build") over the tool they wrap.
- Leave out commands that deploy, publish, push, release, delete data or touch a remote service, unless the request asks for one by name.
- At most ${MAX_PROJECT_COMMANDS} commands; usually two to five is right.
- why: one short Korean sentence saying which file the command comes from and what it does.`;

const SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    commands: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, command: { type: "string" }, why: { type: "string" } },
        required: ["name", "command", "why"],
      },
    },
  },
  required: ["commands"],
});

const ARGS = [
  "--tools",
  "Read,Grep,Glob",
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

export function proposePrompt(): string {
  return "이 저장소에서 버튼으로 돌릴 명령을 찾아 주세요.";
}

export function revisePrompt(current: ProjectCommand[], request: string): string {
  return [
    `지금 등록된 명령:\n${JSON.stringify(current)}`,
    `요청: ${request.trim()}`,
    "요청대로 바꾼 전체 명령 목록을 돌려주세요. 요청과 상관없는 명령은 그대로 두세요.",
  ].join("\n\n");
}

export function proposalsFromOutput(stdout: string): CommandProposal[] {
  const messages: unknown = JSON.parse(stdout);
  const result = Array.isArray(messages) ? messages.find((message) => isRecord(message) && message.type === "result") : messages;
  if (!isRecord(result)) throw new Error("에이전트 응답을 읽지 못했어요");
  if (result.is_error === true) throw new Error(typeof result.result === "string" ? result.result : "에이전트가 실패했어요");
  const output = result.structured_output;
  const listed = isRecord(output) && Array.isArray(output.commands) ? output.commands : null;
  if (!listed) {
    console.error("[command-agent] unexpected output", output);
    throw new Error("에이전트가 명령 목록을 돌려주지 않았어요");
  }
  const proposals = listed.flatMap((item: unknown): CommandProposal[] => {
    const parsed = projectCommandSchema.safeParse(item);
    if (!parsed.success) return [];
    const why = isRecord(item) && typeof item.why === "string" ? item.why.trim() : "";
    return [{ name: parsed.data.name.trim(), command: parsed.data.command.trim(), why }];
  });
  return proposals.filter((proposal, index) => proposals.findIndex((other) => other.name === proposal.name) === index).slice(0, MAX_PROJECT_COMMANDS);
}

async function askAgent(projectPath: string, prompt: string): Promise<CommandProposal[]> {
  try {
    const { stdout } = await execFileAsync(resolveClaudeBin(), ["-p", prompt, ...ARGS], {
      cwd: projectPath,
      timeout: TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
    return proposalsFromOutput(stdout);
  } catch (error) {
    const stderr = isRecord(error) && typeof error.stderr === "string" ? error.stderr.trim() : "";
    if (stderr) console.error("[command-agent] claude failed", stderr);
    if (stderr || !(error instanceof Error)) throw new Error(stderr.split("\n").pop() || "에이전트를 실행하지 못했어요");
    throw error;
  }
}

export function proposeCommands(projectPath: string): Promise<CommandProposal[]> {
  return askAgent(projectPath, proposePrompt());
}

export function reviseCommands(projectPath: string, current: ProjectCommand[], request: string): Promise<CommandProposal[]> {
  return askAgent(projectPath, revisePrompt(current, request));
}
