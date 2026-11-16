import { CONDUCTOR_PROMPT, conductorMcpConfig, MCP_SERVER_NAME } from "../orchestration/conductorPrompt.ts";
import { hookSettings, type StatusLineScript } from "./hookSettings.ts";
import type { Command, CommandRequest } from "./SessionRegistry.ts";

export interface CommandEnvironment {
  claude: string;
  shell: string;
  baseUrl: string;
  statusLine?: StatusLineScript;
}

export function commandFor(request: CommandRequest, environment: CommandEnvironment): Command {
  if (request.kind === "shell") return { file: environment.shell, args: ["-l"] };
  const identity = request.resumeSessionId ? ["--resume", request.resumeSessionId] : ["--session-id", request.id];
  const prompt = request.prompt ? ["--", request.prompt] : [];
  const conductor = request.conductor
    ? [
        "--mcp-config",
        conductorMcpConfig(environment.baseUrl, request.id),
        // The dashboard tools are the conductor's whole job; asking each time would stall it.
        "--allowedTools",
        `mcp__${MCP_SERVER_NAME}`,
        "--append-system-prompt",
        CONDUCTOR_PROMPT,
      ]
    : [];
  return {
    file: environment.claude,
    args: [...identity, "--settings", hookSettings(environment.baseUrl, request.id, environment.statusLine), ...conductor, ...prompt],
  };
}
