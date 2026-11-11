import { connection } from "next/server";
import type { ActivityResponse } from "@/common/sessions/types";
import { services } from "@/server/container";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(request: Request) {
  await connection();
  const sessionId = new URL(request.url).searchParams.get("session") ?? "";
  if (!SESSION_ID.test(sessionId)) {
    return Response.json({ ok: false, error: "invalid session" } satisfies ActivityResponse, { status: 400 });
  }
  try {
    const { items: steps, updatedAt } = await services().activity.read(sessionId);
    return Response.json({ ok: true, steps, updatedAt } satisfies ActivityResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[activity]", sessionId, message);
    return Response.json({ ok: false, error: message } satisfies ActivityResponse, { status: 502 });
  }
}
