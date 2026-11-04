import { stat } from "node:fs/promises";
import path from "node:path";
import { connection, type NextRequest } from "next/server";
import { reportWarning, services } from "@/server/container";
import { missingOr } from "@/server/shared/fallback";
import type { AskAnchor, AskContext, AskEvent, AskThreadsResponse } from "@/common/intentDiff/types";
import type { PreparedAsk } from "@/server/intentDiff/AskRunner";

const MAX_QUESTION = 8000;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLine(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isAnchor(value: unknown): value is AskAnchor {
  if (!isRecord(value) || typeof value.file !== "string" || !isLine(value.startLine) || !isLine(value.endLine)) return false;
  if (value.startLine > value.endLine) return false;
  return value.kind === "lines" || (value.kind === "step" && typeof value.symbolId === "string");
}

function isContext(value: unknown): value is AskContext {
  if (!isRecord(value) || typeof value.label !== "string" || typeof value.diff !== "string") return false;
  if (!Array.isArray(value.intents) || !value.intents.every((intent) => typeof intent === "string")) return false;
  const item = value.planItem;
  return item === null || (isRecord(item) && typeof item.id === "string" && typeof item.title === "string");
}

async function isWorktree(worktreePath: unknown): Promise<boolean> {
  if (typeof worktreePath !== "string" || !path.isAbsolute(worktreePath)) return false;
  const info = await stat(worktreePath).catch(missingOr(null, reportWarning, "intent-diff/ask", { worktreePath }));
  return info?.isDirectory() ?? false;
}

function badRequest(error: string): Response {
  return Response.json({ ok: false, error }, { status: 400 });
}

export async function GET(request: NextRequest) {
  await connection();
  const worktreePath = request.nextUrl.searchParams.get("path");
  if (!worktreePath) return Response.json({ ok: false, error: "path가 필요해요" } satisfies AskThreadsResponse, { status: 400 });
  try {
    return Response.json({ ok: true, threads: await services().askStore.list(worktreePath) } satisfies AskThreadsResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[intent-diff/ask]", message);
    return Response.json({ ok: false, error: message } satisfies AskThreadsResponse, { status: 500 });
  }
}

/** Streams the answer as NDJSON `AskEvent` lines. */
export async function POST(request: NextRequest) {
  await connection();
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || !(await isWorktree(body.worktreePath))) return badRequest("worktreePath가 올바르지 않아요");
  const worktreePath = body.worktreePath as string;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION) return badRequest("질문이 비었거나 너무 길어요");

  let prepared: PreparedAsk;
  if (typeof body.threadId === "string") {
    const thread = await services().askStore.get(body.threadId);
    if (!thread || thread.worktreePath !== worktreePath) return badRequest("대화를 찾지 못했어요");
    prepared = services().askRunner.prepareFollowUp(thread, question);
  } else {
    if (!isAnchor(body.anchor) || !isContext(body.context)) return badRequest("고른 줄 정보가 올바르지 않아요");
    const writer = typeof body.writerSessionId === "string" && SESSION_ID.test(body.writerSessionId) ? body.writerSessionId : null;
    const fresh = body.fresh === true;
    prepared = await services().askRunner.prepareNewThread({
      worktreePath,
      anchor: body.anchor,
      context: body.context,
      writerSessionId: fresh ? null : writer,
      chosenFresh: fresh,
      question,
    });
  }

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: AskEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      services().askRunner.run(prepared, emit)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[intent-diff/ask]", message);
          emit({ type: "error", error: message, thread: null });
        })
        .finally(() => {
          if (open) controller.close();
          open = false;
        });
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
