import { stat } from "node:fs/promises";
import path from "node:path";
import { createWorktree } from "@/lib/worktreeWizard/create";
import { answerWizard, startWizard } from "@/lib/worktreeWizard/run";
import type { WizardOrigin, WizardRequest, WizardResponse, WorktreePlan } from "@/lib/worktreeWizard/types";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_ANSWER = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOrigin(value: unknown): value is WizardOrigin {
  if (!isRecord(value)) return false;
  const from = value.from;
  return (
    typeof value.repoId === "string" &&
    value.repoId.length > 0 &&
    typeof value.repo === "string" &&
    typeof value.anchorPath === "string" &&
    path.isAbsolute(value.anchorPath) &&
    (from === null ||
      (isRecord(from) &&
        typeof from.path === "string" &&
        path.isAbsolute(from.path) &&
        (from.branch === null || typeof from.branch === "string")))
  );
}

function isPlan(value: unknown): value is WorktreePlan {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.branch === "string" &&
    typeof value.baseBranch === "string" &&
    (value.parent === "from" || value.parent === "none") &&
    (value.reference === null || typeof value.reference === "string") &&
    typeof value.firstPrompt === "string" &&
    typeof value.summary === "string"
  );
}

function isRequest(value: unknown): value is WizardRequest {
  if (!isRecord(value) || !isOrigin(value.origin)) return false;
  if (value.action === "start") return true;
  if (value.action === "answer") {
    return (
      typeof value.sessionId === "string" &&
      SESSION_ID.test(value.sessionId) &&
      typeof value.answer === "string" &&
      value.answer.trim().length > 0 &&
      value.answer.length <= MAX_ANSWER
    );
  }
  return value.action === "create" && isPlan(value.plan);
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRequest(body)) {
    return Response.json({ ok: false, error: "invalid request" } satisfies WizardResponse, { status: 400 });
  }
  try {
    const info = await stat(body.origin.anchorPath);
    if (!info.isDirectory()) throw new Error("워크트리 폴더가 없어요");
    if (body.action === "start") {
      return Response.json({ ok: true, ...(await startWizard(body.origin)) } satisfies WizardResponse);
    }
    if (body.action === "answer") {
      const next = await answerWizard(body.origin.anchorPath, body.sessionId, body.answer.trim());
      return Response.json({ ok: true, ...next } satisfies WizardResponse);
    }
    return Response.json({ ok: true, created: await createWorktree(body.origin, body.plan) } satisfies WizardResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[worktree-wizard]", body.action, message);
    return Response.json({ ok: false, error: message } satisfies WizardResponse, { status: 500 });
  }
}
