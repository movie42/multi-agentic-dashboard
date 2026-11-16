import { connection, type NextRequest } from "next/server";
import type { ProjectOverlapsResponse } from "@/common/projectOverview/types";
import { reportWarning, services } from "@/server/container";

export async function GET(request: NextRequest) {
  await connection();
  const projectPath = request.nextUrl.searchParams.get("project");
  if (!projectPath?.startsWith("/")) {
    return Response.json({ ok: false, error: "project(프로젝트 절대 경로)가 필요해요" } satisfies ProjectOverlapsResponse, { status: 400 });
  }
  try {
    return Response.json({ ok: true, overlaps: await services().projectOverlaps(projectPath) } satisfies ProjectOverlapsResponse);
  } catch (error) {
    reportWarning("project-overlaps", error, { projectPath });
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message } satisfies ProjectOverlapsResponse, { status: 500 });
  }
}
