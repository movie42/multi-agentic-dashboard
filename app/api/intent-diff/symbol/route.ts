import { connection, type NextRequest } from "next/server";
import { reportWarning, services } from "@/server/container";
import { reportAnd } from "@/server/shared/fallback";
import { git } from "@/server/intentDiff/gitDiff";
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
    const rev = params.get("rev");
    const shownText = rev ? ((await git(worktreePath, ["show", `${rev}:${file}`]).catch(reportAnd("", reportWarning, "intent-diff/symbol", { worktreePath, rev, file }))).split("\n")[line - 1] ?? null) : null;
    const lookup = services().languageServices.lookup(worktreePath, file, line, column, shownText);
    await services().highlighter.lookup(worktreePath, lookup);
    return Response.json({ ok: true, lookup } satisfies SymbolLookupResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[intent-diff/symbol]", message);
    return Response.json({ ok: false, error: message } satisfies SymbolLookupResponse, { status: 500 });
  }
}
