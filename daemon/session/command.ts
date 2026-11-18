import { conductorInstructions, MCP_SERVER_NAME } from "../orchestration/conductorMcp.ts";
import { judgeInstructions } from "../templates/judgeMcp.ts";
import { hookSettings, type StatusLineScript } from "./hookSettings.ts";
import { isZsh } from "./shellIntegration.ts";
import type { Command, CommandRequest } from "./SessionRegistry.ts";

export interface CommandEnvironment {
  claude: string;
  shell: string;
  baseUrl: string;
  statusLine?: StatusLineScript;
  /**
   * Where the app saves pasted files, one new folder per file, plus its symlink-resolved spelling.
   * Without a read rule Claude asks to read every attachment, and "don't ask again" covers only that
   * one folder. `--add-dir` is not used: Claude Code 2.1.3xx shows a blocking directory-trust dialog
   * for it on every new session.
   */
  attachmentDirs?: readonly string[];
  /** zsh startup files that add command marks; `user` is the ZDOTDIR the person's own files live in. */
  zshIntegration?: { dir: string; user: string };
}

export function mcpUrl(baseUrl: string, sessionId: string): string {
  return `${baseUrl}/mcp/${encodeURIComponent(sessionId)}`;
}

/** A conductor reaches the daemon's orchestration tools over MCP and may call them without asking. */
function conductorArgs(request: CommandRequest, baseUrl: string): string[] {
  if (!request.conductor) return [];
  const config = { mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: mcpUrl(baseUrl, request.id) } } };
  return [
    "--mcp-config",
    JSON.stringify(config),
    "--allowedTools",
    `mcp__${MCP_SERVER_NAME}`,
    "--append-system-prompt",
    conductorInstructions(),
  ];
}

function judgeArgs(request: CommandRequest, baseUrl: string): string[] {
  if (!request.judge || request.conductor) return [];
  const config = { mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: mcpUrl(baseUrl, request.id) } } };
  return ["--mcp-config", JSON.stringify(config), "--allowedTools", `mcp__${MCP_SERVER_NAME}`, "--append-system-prompt", judgeInstructions()];
}

function modelArgs(request: CommandRequest): string[] {
  return [...(request.model ? ["--model", request.model] : []), ...(request.effort ? ["--effort", request.effort] : [])];
}

export function commandFor(request: CommandRequest, environment: CommandEnvironment): Command {
  if (request.kind === "shell") {
    const integration = environment.zshIntegration;
    const env = integration && isZsh(environment.shell) ? { ZDOTDIR: integration.dir, AC_USER_ZDOTDIR: integration.user } : undefined;
    return { file: environment.shell, args: ["-l"], ...(env ? { env } : {}) };
  }
  const identity = request.resumeSessionId ? ["--resume", request.resumeSessionId] : ["--session-id", request.id];
  const prompt = request.prompt ? ["--", request.prompt] : [];
  return {
    file: environment.claude,
    args: [
      ...identity,
      ...conductorArgs(request, environment.baseUrl),
      ...judgeArgs(request, environment.baseUrl),
      ...modelArgs(request),
      ...(request.askPermissions ? [] : ["--permission-mode", "bypassPermissions"]),
      "--settings",
      hookSettings(environment.baseUrl, request.id, environment.statusLine, environment.attachmentDirs),
      ...prompt,
    ],
  };
}
