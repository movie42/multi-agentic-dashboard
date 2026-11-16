import { connection, type NextRequest } from "next/server";
import { reportWarning, services } from "@/server/container";
import { FILE_ERROR_TEXT } from "../errors";

export async function GET(request: NextRequest) {
  await connection();
  const requested = request.nextUrl.searchParams.get("path");
  if (!requested) return new Response("path가 없어요", { status: 400 });
  try {
    const result = await services().files.raw(requested);
    if (!result.ok) return new Response(FILE_ERROR_TEXT[result.status], { status: result.status });
    return new Response(result.body, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
        // An SVG opened directly must not run its scripts on this origin.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    reportWarning("files/raw", error, { requested });
    return new Response("unreadable file", { status: 500 });
  }
}
