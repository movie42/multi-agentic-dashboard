import { RUNNER_PORT, type RunnerSession } from "@/common/runner/types";
import { errorField } from "@/client/shared/api/json";

export const RUNNER_HTTP = process.env.NEXT_PUBLIC_RUNNER_ORIGIN ?? `http://127.0.0.1:${RUNNER_PORT}`;
export const RUNNER_WS = RUNNER_HTTP.replace(/^http/, "ws");

const OFFLINE_MESSAGE = "세션 러너 데몬에 연결하지 못했어요. 터미널에서 bun run daemon을 실행해 주세요.";

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${RUNNER_HTTP}${path}`, { cache: "no-store", ...init }).catch((error: unknown) => {
    console.error("[runner] request failed", path, error);
    throw new Error(OFFLINE_MESSAGE);
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorField(body) ?? `세션 러너가 ${response.status}로 응답했어요.`);
  return body;
}

function sessionOf(body: unknown): RunnerSession {
  if (typeof body === "object" && body !== null && "session" in body && typeof body.session === "object" && body.session) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- body comes from the runner daemon, whose type lives in src/common
    return body.session as RunnerSession;
  }
  throw new Error("세션 러너 응답에 세션이 없어요.");
}

export async function launchSession(cwd: string): Promise<RunnerSession> {
  const body = await call("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd }),
  });
  return sessionOf(body);
}

export async function closeSession(id: string): Promise<void> {
  await call(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function terminalSocketUrl(id: string): string {
  return `${RUNNER_WS}/sessions/${encodeURIComponent(id)}/terminal`;
}

export const EVENTS_SOCKET_URL = `${RUNNER_WS}/events`;
