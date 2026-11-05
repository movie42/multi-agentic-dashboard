import { connection } from "next/server";
import { z } from "zod";
import { services } from "@/server/container";
import type { RuntimeResponse } from "@/common/orca/runtime";

const switchRequestSchema = z.object({ mode: z.enum(["app", "headless"]) });

export async function GET() {
  await connection();
  const { mode } = await services().orca.runtime.read();
  return Response.json({ ok: true, mode } satisfies RuntimeResponse);
}

export async function POST(request: Request) {
  const parsed = switchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid mode" } satisfies RuntimeResponse, { status: 400 });
  }
  const target = parsed.data.mode;
  const task = services().orca.runtime.switchOnce(target);
  if (!task) {
    return Response.json({ ok: false, error: "이미 전환 중이에요" } satisfies RuntimeResponse, { status: 409 });
  }
  try {
    const mode = await task;
    return Response.json({ ok: true, mode } satisfies RuntimeResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[runtime]", target, message);
    return Response.json({ ok: false, error: message } satisfies RuntimeResponse, { status: 500 });
  }
}
