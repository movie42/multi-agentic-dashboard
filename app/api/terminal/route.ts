import { connection } from "next/server";
import { terminalReadSchema } from "@/server/orca/schema";
import { parseChoicePrompt, type TerminalScreenResponse } from "@/common/orca/screen";
import { services } from "@/server/container";

const HANDLE = /^term_[0-9a-f-]+$/;

export async function GET(request: Request) {
  await connection();
  const handle = new URL(request.url).searchParams.get("handle") ?? "";
  if (!HANDLE.test(handle)) {
    return Response.json({ ok: false, error: "invalid handle" } satisfies TerminalScreenResponse, { status: 400 });
  }
  try {
    const result = await services().orca.cli.run(["terminal", "read", "--terminal", handle, "--screen"], terminalReadSchema);
    const lines = result.terminal.tail.map((line) => line.replace(/\s+$/, ""));
    return Response.json({ ok: true, screen: { lines, choice: parseChoicePrompt(lines) } } satisfies TerminalScreenResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[terminal]", message);
    return Response.json({ ok: false, error: message } satisfies TerminalScreenResponse, { status: 502 });
  }
}
