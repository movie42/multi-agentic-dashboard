import { connection } from "next/server";
import type { DevPortsResponse } from "@/common/devPorts/types";
import { services } from "@/server/container";

export async function GET() {
  await connection();
  try {
    return Response.json({ ok: true, ports: await services().devPorts.read() } satisfies DevPortsResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[dev-ports]", message);
    return Response.json({ ok: false, error: message } satisfies DevPortsResponse, { status: 500 });
  }
}
