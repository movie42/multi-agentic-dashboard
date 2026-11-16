import { conductorInstructions, MCP_SERVER_NAME } from "../orchestration/conductorMcp.ts";
import { hookSettings, type StatusLineScript } from "./hookSettings.ts";
import type { Command, CommandRequest } from "./SessionRegistry.ts";

export interface CommandEnvironment {
  claude: string;
  shell: string;
  baseUrl: string;
  statusLine?: StatusLineScript;
  /**
   * Where the app saves pasted files, one new folder per file. Without it Claude asks to read every
   * attachment, and "don't ask again" covers only that one folder.
   */
  attachmentDir?: string;
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

export function commandFor(request: CommandRequest, environment: CommandEnvironment): Command {
  if (request.kind === "shell") return { file: environment.shell, args: ["-l"] };
  const identity = request.resumeSessionId ? ["--resume", request.resumeSessionId] : ["--session-id", request.id];
  const prompt = request.prompt ? ["--", request.prompt] : [];
  return {
    file: environment.claude,
    args: [
      ...identity,
      ...conductorArgs(request, environment.baseUrl),
      ...(environment.attachmentDir ? ["--add-dir", environment.attachmentDir] : []),
      ...(request.askPermissions ? [] : ["--permission-mode", "bypassPermissions"]),
      "--settings",
      hookSettings(environment.baseUrl, request.id, environment.statusLine),
      ...prompt,
    ],
  };
}
