import { connection } from "next/server";
import type { UsageResponse } from "@/common/usage/types";
import { services } from "@/server/container";

export async function GET(request: Request) {
  await connection();
  try {
    const snapshot = await services().usage.read({ fresh: new URL(request.url).searchParams.has("fresh") });
    return Response.json({ ok: true, ...snapshot } satisfies UsageResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[usage]", message);
    return Response.json({ ok: false, error: message } satisfies UsageResponse, { status: 502 });
  }
}
