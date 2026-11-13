import { connection, type NextRequest } from "next/server";
import type { WorkingTreeResponse } from "@/common/gitGraph/types";
import { services } from "@/server/container";

export async function GET(request: NextRequest) {
  await connection();
  const worktreePath = request.nextUrl.searchParams.get("path");
  if (!worktreePath?.startsWith("/")) {
    return Response.json({ ok: false, error: "path(워크트리 절대 경로)가 필요해요" } satisfies WorkingTreeResponse, { status: 400 });
  }
  try {
    return Response.json({ ok: true, tree: await services().gitGraph.readWorkingTree(worktreePath) } satisfies WorkingTreeResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[git-graph/working]", message);
    return Response.json({ ok: false, error: message } satisfies WorkingTreeResponse, { status: 500 });
  }
}
