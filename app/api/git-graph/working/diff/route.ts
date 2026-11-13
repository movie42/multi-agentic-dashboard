import { connection, type NextRequest } from "next/server";
import type { WorkingDiffResponse } from "@/common/gitGraph/types";
import { services } from "@/server/container";

export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const worktreePath = params.get("path");
  const file = params.get("file");
  if (!worktreePath?.startsWith("/") || !file) {
    return Response.json({ ok: false, error: "path와 file이 필요해요" } satisfies WorkingDiffResponse, { status: 400 });
  }
  try {
    return Response.json({ ok: true, diff: await services().gitGraph.readWorkingDiff(worktreePath, file) } satisfies WorkingDiffResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[git-graph/working/diff]", message);
    return Response.json({ ok: false, error: message } satisfies WorkingDiffResponse, { status: 500 });
  }
}
