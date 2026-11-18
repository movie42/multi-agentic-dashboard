import { connection } from "next/server";
import { readRunningBuildInfo } from "@/server/appStatus/readAppStatus";

// desktop/main.mjs reads `app` to tell its own server apart from another app holding the same port;
// scripts/apply-app.mjs reads `commit` to confirm the relaunched app runs the new build.
export async function GET() {
  await connection();
  const build = await readRunningBuildInfo();
  return Response.json({ app: "agent-control", commit: build?.commit ?? null });
}
