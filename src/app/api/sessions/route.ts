import { connection } from "next/server";
import { readBookmarks } from "@/lib/sessions/bookmarks";
import { listClaudeSessions } from "@/lib/sessions/claudeSessions";
import type { SessionsResponse } from "@/lib/sessions/types";

export async function GET() {
  await connection();
  try {
    const [summaries, bookmarks] = await Promise.all([listClaudeSessions(), readBookmarks()]);
    const sessions = summaries.map((session) => ({ ...session, bookmark: bookmarks.get(session.sessionId) ?? null }));
    return Response.json({ ok: true, sessions, scannedAt: Date.now() } satisfies SessionsResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sessions]", message);
    return Response.json({ ok: false, error: message } satisfies SessionsResponse, { status: 500 });
  }
}
