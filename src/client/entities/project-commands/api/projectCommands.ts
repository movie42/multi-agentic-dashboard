import type {
  CommandProposal,
  ProjectCommand,
  ProjectCommandsEntry,
  ProjectCommandsListResponse,
  ProjectCommandsProposalResponse,
  ProjectCommandsRequest,
} from "@/common/appStatus/types";
import { readJson } from "@/client/shared/api/json";

export const projectCommandsKey = ["project-commands"] as const;

export async function fetchProjectCommands(): Promise<ProjectCommandsEntry[]> {
  const payload = await readJson<ProjectCommandsListResponse>(await fetch("/api/project-commands"));
  if (!payload.ok) throw new Error(payload.error);
  return payload.projects;
}

async function post<T>(request: ProjectCommandsRequest): Promise<T> {
  const response = await fetch("/api/project-commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return readJson<T>(response);
}

export async function proposeProjectCommands(projectPath: string, request: string | null): Promise<CommandProposal[]> {
  const payload = await post<ProjectCommandsProposalResponse>(
    request === null ? { type: "propose", projectPath } : { type: "revise", projectPath, request },
  );
  if (!payload.ok) throw new Error(payload.error);
  return payload.proposals;
}

export async function saveProjectCommands(projectPath: string, commands: ProjectCommand[]): Promise<ProjectCommandsEntry[]> {
  const payload = await post<ProjectCommandsListResponse>({ type: "save", projectPath, commands });
  if (!payload.ok) throw new Error(payload.error);
  return payload.projects;
}
