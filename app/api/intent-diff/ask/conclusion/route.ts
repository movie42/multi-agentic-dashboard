import { connection } from "next/server";
import { conclusionRequestSchema, type ConclusionResponse } from "@/common/intentDiff/conclusion";
import { services } from "@/server/container";

export async function POST(request: Request) {
  await connection();
  const parsed = conclusionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "결론 요청이 올바르지 않아요" } satisfies ConclusionResponse, { status: 400 });
  }
  try {
    return Response.json({ ok: true, threads: await services().concludeAsk(parsed.data) } satisfies ConclusionResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[intent-diff/ask/conclusion]", message);
    return Response.json({ ok: false, error: message } satisfies ConclusionResponse, { status: 500 });
  }
}
