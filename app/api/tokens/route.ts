import { connection } from "next/server";
import type { TokenTallyResponse } from "@/common/tokens/types";
import { services } from "@/server/container";

export async function GET() {
  await connection();
  try {
    const tally = await services().tokens.read();
    return Response.json({ ok: true, ...tally } satisfies TokenTallyResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[tokens]", message);
    return Response.json({ ok: false, error: message } satisfies TokenTallyResponse, { status: 500 });
  }
}
