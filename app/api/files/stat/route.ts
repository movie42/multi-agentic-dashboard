import { connection, type NextRequest } from "next/server";
import { reportWarning, services } from "@/server/container";
import { FILE_ERROR_TEXT } from "../errors";

export async function GET(request: NextRequest) {
  await connection();
  const requested = request.nextUrl.searchParams.get("path");
  if (!requested) return Response.json({ ok: false, error: "path가 없어요" }, { status: 400 });
  try {
    const result = await services().files.stat(requested);
    if (!result.ok) return Response.json({ ok: false, error: FILE_ERROR_TEXT[result.status] }, { status: result.status });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    reportWarning("files/stat", error, { requested });
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
