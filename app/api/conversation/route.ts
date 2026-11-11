import { connection } from "next/server";
import type { ConversationResponse } from "@/common/sessions/types";
import { services } from "@/server/container";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(request: Request) {
  await connection();
  const sessionId = new URL(request.url).searchParams.get("session") ?? "";
  if (!SESSION_ID.test(sessionId)) {
    return Response.json({ ok: false, error: "invalid session" } satisfies ConversationResponse, { status: 400 });
  }
  try {
    const { items: turns, updatedAt } = await services().conversation.read(sessionId);
    return Response.json({ ok: true, turns, updatedAt } satisfies ConversationResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[conversation]", sessionId, message);
    return Response.json({ ok: false, error: message } satisfies ConversationResponse, { status: 502 });
  }
}
