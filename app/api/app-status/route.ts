import { connection } from "next/server";
import { appStatusActionSchema, type AppStatusResponse } from "@/common/appStatus/types";
import { services } from "@/server/container";

export async function GET() {
  await connection();
  try {
    return Response.json({ ok: true, status: await services().appStatus.read() } satisfies AppStatusResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[app-status]", message);
    return Response.json({ ok: false, error: message } satisfies AppStatusResponse, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = appStatusActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid app status action" } satisfies AppStatusResponse, { status: 400 });
  }
  const { appStatus } = services();
  try {
    const action = parsed.data;
    if (action.type === "build-app") await appStatus.buildApp();
    else if (action.type === "restart-daemon") await appStatus.restarter.request(action.when);
    else appStatus.restarter.cancel();
    return Response.json({ ok: true, status: await appStatus.read() } satisfies AppStatusResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[app-status]", parsed.data.type, message);
    return Response.json({ ok: false, error: message } satisfies AppStatusResponse, { status: 500 });
  }
}
