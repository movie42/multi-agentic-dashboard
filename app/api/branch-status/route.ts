import { stat } from "node:fs/promises";
import type { NextRequest } from "next/server";
import type { BranchStatusResponse } from "@/common/appStatus/types";
import { services } from "@/server/container";

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("path") ?? "";
  if (!target.startsWith("/")) {
    return Response.json({ ok: false, error: "absolute path required" } satisfies BranchStatusResponse, { status: 400 });
  }
  try {
    if (!(await stat(target)).isDirectory()) throw new Error("폴더가 아니에요");
    return Response.json({ ok: true, status: await services().appStatus.branchStatus(target) } satisfies BranchStatusResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[branch-status]", target, message);
    return Response.json({ ok: false, error: message } satisfies BranchStatusResponse, { status: 500 });
  }
}
