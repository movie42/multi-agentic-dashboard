import { connection } from "next/server";
import type { SessionsResponse } from "@/common/sessions/types";
import { services } from "@/server/container";

export async function GET() {
  await connection();
  try {
    const [summaries, bookmarks] = await Promise.all([services().sessionIndex.list(), services().bookmarks.read()]);
    const sessions = summaries.map((session) => ({ ...session, bookmark: bookmarks.get(session.sessionId) ?? null }));
    return Response.json({ ok: true, sessions, scannedAt: Date.now() } satisfies SessionsResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sessions]", message);
    return Response.json({ ok: false, error: message } satisfies SessionsResponse, { status: 500 });
  }
}
