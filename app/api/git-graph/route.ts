import { connection, type NextRequest } from "next/server";
import type { GitGraphResponse } from "@/common/gitGraph/types";
import { services } from "@/server/container";

export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const worktreePath = params.get("path");
  if (!worktreePath?.startsWith("/")) {
    return Response.json({ ok: false, error: "path(워크트리 절대 경로)가 필요해요" } satisfies GitGraphResponse, { status: 400 });
  }
  const skip = Math.max(0, Number.parseInt(params.get("skip") ?? "0", 10) || 0);
  try {
    return Response.json({ ok: true, graph: await services().gitGraph.readGraph(worktreePath, skip) } satisfies GitGraphResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[git-graph]", message);
    return Response.json({ ok: false, error: message } satisfies GitGraphResponse, { status: 500 });
  }
}
