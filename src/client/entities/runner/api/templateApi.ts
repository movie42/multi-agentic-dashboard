import { queryOptions } from "@tanstack/react-query";
import { templatesOf, type WorkflowTemplate } from "@/common/templates/types";
import { errorField } from "@/client/shared/api/json";
import { RUNNER_HTTP } from "./runnerApi";

export const templateKeys = {
  all: ["templates"] as const,
};

const JSON_HEADERS = { "Content-Type": "application/json" };

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${RUNNER_HTTP}${path}`, { cache: "no-store", ...init }).catch((error: unknown) => {
    console.error("[templates] request failed", path, error);
    throw new Error("세션 러너 데몬에 연결하지 못했어요.");
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorField(body) ?? `세션 러너가 ${response.status}로 응답했어요.`);
  return body;
}

export async function fetchTemplates(): Promise<WorkflowTemplate[]> {
  return templatesOf(await call("/templates"));
}

export function templatesQueryOptions() {
  return queryOptions({ queryKey: templateKeys.all, queryFn: fetchTemplates, retry: false, refetchOnWindowFocus: true });
}

export async function saveTemplate(template: WorkflowTemplate): Promise<void> {
  await call("/templates", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(template) });
}

export async function removeTemplate(id: string): Promise<void> {
  await call(`/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function expandTemplate(request: { templateId: string; cwd: string; intent: string; start: boolean }): Promise<void> {
  await call("/runs", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(request) });
}

export type RunAction = { action: "start" } | { action: "stop" } | { action: "continue"; routeId?: string } | { action: "retry"; text: string };

export async function controlRun(runId: string, request: RunAction): Promise<void> {
  const { action, ...body } = request;
  await call(`/runs/${encodeURIComponent(runId)}/${action}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export async function removeRun(runId: string): Promise<void> {
  await call(`/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
}
