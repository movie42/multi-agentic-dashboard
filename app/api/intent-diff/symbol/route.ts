import { connection, type NextRequest } from "next/server";
import { services } from "@/server/container";
import type { SymbolLookupResponse } from "@/common/intentDiff/types";

export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const worktreePath = params.get("path");
  const file = params.get("file");
  const line = Number(params.get("line"));
  const column = Number(params.get("col"));
  if (!worktreePath || !file || !line || Number.isNaN(column)) {
    return Response.json({ ok: false, error: "path, file, line, col이 필요해요" } satisfies SymbolLookupResponse, { status: 400 });
  }
  try {
    const lookup = await services().lookupSymbol({ worktreePath, rev: params.get("rev"), file, line, column });
    return Response.json({ ok: true, lookup } satisfies SymbolLookupResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[intent-diff/symbol]", message);
    return Response.json({ ok: false, error: message } satisfies SymbolLookupResponse, { status: 500 });
  }
}
