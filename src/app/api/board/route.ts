import { connection } from "next/server";
import { loadBoard } from "@/lib/orca/board";
import type { BoardResponse } from "@/lib/orca/types";
import { warmClaudeSessions } from "@/lib/sessions/claudeSessions";

export async function GET() {
  await connection();
  warmClaudeSessions();
  try {
    const board = await loadBoard();
    return Response.json({ ok: true, board } satisfies BoardResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[board]", message);
    return Response.json({ ok: false, error: message } satisfies BoardResponse, {
      status: 502,
    });
  }
}
