import { connection } from "next/server";

// desktop/main.mjs reads `app` to tell its own server apart from another app holding the same port.
export async function GET() {
  await connection();
  return Response.json({ app: "agent-control" });
}
