import { z } from "zod";
import { SESSION_ID } from "@/common/sessions/limits";
import type { TodoAgentResponse } from "@/common/todos/agentTurn";
import { services } from "@/server/container";

const requestSchema = z.object({
  conversationId: z.string().regex(SESSION_ID).nullable(),
  message: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid agent request" } satisfies TodoAgentResponse, { status: 400 });
  }
  try {
    const turn = await services().todoAgent.send(parsed.data);
    return Response.json({ ok: true, ...turn } satisfies TodoAgentResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[todos/agent]", message);
    return Response.json({ ok: false, error: message } satisfies TodoAgentResponse, { status: 500 });
  }
}
