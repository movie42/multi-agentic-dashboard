import { connection, type NextRequest } from "next/server";
import type { CommitDiffResponse } from "@/common/gitGraph/types";
import { services } from "@/server/container";

export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const worktreePath = params.get("path");
  const sha = params.get("sha");
  const file = params.get("file");
  if (!worktreePath?.startsWith("/") || !sha || !file) {
    return Response.json({ ok: false, error: "path, sha, file이 필요해요" } satisfies CommitDiffResponse, { status: 400 });
  }
  try {
    const diff = await services().gitGraph.readCommitDiff(worktreePath, sha, file, params.get("from"));
    return Response.json({ ok: true, diff } satisfies CommitDiffResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[git-graph/commit/diff]", message);
    return Response.json({ ok: false, error: message } satisfies CommitDiffResponse, { status: 500 });
  }
}
