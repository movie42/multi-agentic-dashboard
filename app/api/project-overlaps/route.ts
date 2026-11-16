import { connection, type NextRequest } from "next/server";
import type { FileOverlapsResponse } from "@/common/projects/overlaps";
import { services } from "@/server/container";

const MAX_WORKTREES = 40;

export async function GET(request: NextRequest) {
  await connection();
  const paths = request.nextUrl.searchParams.getAll("path");
  if (paths.length === 0 || paths.length > MAX_WORKTREES || paths.some((path) => !path.startsWith("/"))) {
    return Response.json({ ok: false, error: `path(워크트리 절대 경로)를 1–${MAX_WORKTREES}개 넘겨 주세요` } satisfies FileOverlapsResponse, { status: 400 });
  }
  try {
    return Response.json({ ok: true, overlaps: await services().fileOverlaps(paths) } satisfies FileOverlapsResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[project-overlaps]", message);
    return Response.json({ ok: false, error: message } satisfies FileOverlapsResponse, { status: 500 });
  }
}
