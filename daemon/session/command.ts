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
  return {
    file: environment.claude,
    args: [...identity, "--settings", hookSettings(environment.baseUrl, request.id, environment.statusLine), ...prompt],
  };
}
