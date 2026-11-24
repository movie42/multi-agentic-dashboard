import { connection } from "next/server";
import { sketchPutSchema } from "@/common/sketch/schema";
import type { SketchResponse } from "@/common/sketch/types";
import { services } from "@/server/container";

const failure = (error: unknown, status = 500) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[sketches]", message);
  return Response.json({ ok: false, error: message } satisfies SketchResponse, { status });
};

export async function GET(request: Request) {
  await connection();
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return Response.json({ ok: false, error: "key is required" } satisfies SketchResponse, { status: 400 });
  try {
    return Response.json({ ok: true, items: await services().sketches.read(key) } satisfies SketchResponse);
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  const parsed = sketchPutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid sketch" } satisfies SketchResponse, { status: 400 });
  try {
    await services().sketches.write(parsed.data.key, parsed.data.items);
    return Response.json({ ok: true, items: parsed.data.items } satisfies SketchResponse);
  } catch (error) {
    return failure(error);
  }
}
