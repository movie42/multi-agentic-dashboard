import { connection } from "next/server";
import { services } from "@/server/container";
import type { RuntimeResponse } from "@/common/orca/runtime";

let switching: Promise<unknown> | null = null;

export async function GET() {
  await connection();
  const { mode } = await services().orca.runtime.read();
  return Response.json({ ok: true, mode } satisfies RuntimeResponse);
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const target =
    typeof body === "object" && body !== null && "mode" in body ? (body as { mode: unknown }).mode : null;
  if (target !== "app" && target !== "headless") {
    return Response.json({ ok: false, error: "invalid mode" } satisfies RuntimeResponse, { status: 400 });
  }
  if (switching) {
    return Response.json({ ok: false, error: "이미 전환 중이에요" } satisfies RuntimeResponse, { status: 409 });
  }

  const task = services().orca.runtime.switchTo(target);
  switching = task;
  try {
    const mode = await task;
    return Response.json({ ok: true, mode } satisfies RuntimeResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[runtime]", target, message);
    return Response.json({ ok: false, error: message } satisfies RuntimeResponse, { status: 500 });
  } finally {
    switching = null;
  }
}
