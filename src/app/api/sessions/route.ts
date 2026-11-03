import { connection } from "next/server";
import { listClaudeSessions } from "@/lib/sessions/claudeSessions";
import type { SessionsResponse } from "@/lib/sessions/types";

export async function GET() {
  await connection();
  try {
    const sessions = await listClaudeSessions();
    return Response.json({ ok: true, sessions, scannedAt: Date.now() } satisfies SessionsResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sessions]", message);
    return Response.json({ ok: false, error: message } satisfies SessionsResponse, { status: 500 });
  }
}
