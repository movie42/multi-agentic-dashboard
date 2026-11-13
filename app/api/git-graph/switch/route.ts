import { switchBranchSchema } from "@/common/gitGraph/schema";
import type { SwitchBranchResponse } from "@/common/gitGraph/types";
import { services } from "@/server/container";

export async function POST(request: Request) {
  const parsed = switchBranchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid switch request" } satisfies SwitchBranchResponse, { status: 400 });
  }
  try {
    return Response.json({ ok: true, branch: await services().gitGraph.switchBranch(parsed.data) } satisfies SwitchBranchResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[git-graph/switch]", parsed.data.kind, message);
    return Response.json({ ok: false, error: message } satisfies SwitchBranchResponse, { status: 500 });
  }
}
