import { connection } from "next/server";
import { TodoRuleError } from "@/common/todos/board";
import { todoOpSchema } from "@/common/todos/ops";
import type { TodoResponse } from "@/common/todos/types";
import { services } from "@/server/container";

export async function GET() {
  await connection();
  try {
    return Response.json({ ok: true, board: await services().todos.read() } satisfies TodoResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[todos]", message);
    return Response.json({ ok: false, error: message } satisfies TodoResponse, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = todoOpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid todo op" } satisfies TodoResponse, { status: 400 });
  }
  try {
    const { board, createdId } = await services().todos.apply(parsed.data);
    return Response.json({ ok: true, board, ...(createdId ? { createdId } : {}) } satisfies TodoResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[todos]", parsed.data.type, message);
    const status = error instanceof TodoRuleError ? 409 : 500;
    return Response.json({ ok: false, error: message } satisfies TodoResponse, { status });
  }
}
