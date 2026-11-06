import { connection } from "next/server";
import type { BoardResponse } from "@/common/orca/types";
import { reportWarning, services } from "@/server/container";

export async function GET() {
  await connection();
  services().permissions.markBoardSeen();
  services().sessionIndex.warm();
  try {
    const board = await services().orca.board.load();
    void services()
      .todoAutoMover.observe(board)
      .catch((error: unknown) => reportWarning("todos", error, { step: "auto move" }));
    return Response.json({ ok: true, board } satisfies BoardResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[board]", message);
    return Response.json({ ok: false, error: message } satisfies BoardResponse, {
      status: 502,
    });
  }
}
