import { conductorInstructions, MCP_SERVER_NAME } from "../orchestration/conductorMcp.ts";
import { judgeInstructions } from "../templates/judgeMcp.ts";
import { uiInstructions } from "../ui/uiMcp.ts";
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

/**
 * Every Claude session reaches the daemon's MCP server: render_ui for all, plus the orchestration
 * tools for a conductor or the route tool for a judge card. Claude Code keeps one appended system
 * prompt, so the role text and the render_ui note go in together.
 */
function mcpArgs(request: CommandRequest, baseUrl: string): string[] {
  const config = { mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: mcpUrl(baseUrl, request.id) } } };
  const role = request.conductor ? conductorInstructions() : request.judge ? judgeInstructions() : null;
  return [
    "--mcp-config",
    JSON.stringify(config),
    "--allowedTools",
    `mcp__${MCP_SERVER_NAME}`,
    "--append-system-prompt",
    [role, uiInstructions()].filter(Boolean).join("\n\n"),
  ];
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
      ...mcpArgs(request, environment.baseUrl),
      ...modelArgs(request),
      "--permission-mode",
      "bypassPermissions",
      "--settings",
      hookSettings(environment.baseUrl, request.id, environment.statusLine, environment.attachmentDirs),
      ...prompt,
    ],
  };
}
