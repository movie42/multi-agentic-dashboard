import { NextResponse, type NextRequest } from "next/server";
import { isAllowedRequest } from "@/lib/security/origin";

export function proxy(request: NextRequest) {
  if (isAllowedRequest(request.method, request.nextUrl.pathname, request.headers)) return NextResponse.next();
  console.warn("[proxy] blocked", request.method, request.nextUrl.pathname, request.headers.get("origin"), request.headers.get("host"));
  return Response.json({ ok: false, error: "forbidden origin" }, { status: 403 });
}

export const config = {
  matcher: "/api/:path*",
};
