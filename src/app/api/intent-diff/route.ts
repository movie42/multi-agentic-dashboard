import { connection, type NextRequest } from "next/server";
import { buildIntentDiff } from "@/lib/intentDiff/build";
import type { IntentDiffResponse } from "@/lib/intentDiff/types";

export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const worktreePath = params.get("path");
  if (!worktreePath) {
    return Response.json({ ok: false, error: "path가 필요해요" } satisfies IntentDiffResponse, { status: 400 });
  }
  try {
    const result = await buildIntentDiff({
      worktreePath,
      base: params.get("base") || null,
      head: params.get("head") || null,
      task: params.get("task") || null,
    });
    return Response.json({ ok: true, result } satisfies IntentDiffResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[intent-diff]", message);
    return Response.json({ ok: false, error: message } satisfies IntentDiffResponse, { status: 500 });
  }
}
