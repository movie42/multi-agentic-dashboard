import { connection } from "next/server";
import { runOrca } from "@/lib/orca/cli";
import { terminalReadSchema } from "@/server/orca/schema";
import { parseChoicePrompt, type TerminalScreenResponse } from "@/lib/orca/screen";

const HANDLE = /^term_[0-9a-f-]+$/;

export async function GET(request: Request) {
  await connection();
  const handle = new URL(request.url).searchParams.get("handle") ?? "";
  if (!HANDLE.test(handle)) {
    return Response.json({ ok: false, error: "invalid handle" } satisfies TerminalScreenResponse, { status: 400 });
  }
  try {
    const result = await runOrca(["terminal", "read", "--terminal", handle, "--screen"], terminalReadSchema);
    const lines = result.terminal.tail.map((line) => line.replace(/\s+$/, ""));
    return Response.json({ ok: true, screen: { lines, choice: parseChoicePrompt(lines) } } satisfies TerminalScreenResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[terminal]", message);
    return Response.json({ ok: false, error: message } satisfies TerminalScreenResponse, { status: 502 });
  }
}
