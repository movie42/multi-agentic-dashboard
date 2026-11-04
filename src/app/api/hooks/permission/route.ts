import {
  HOLD_MS,
  holdPermission,
  isDashboardOpen,
  releasePermission,
} from "@/lib/permissions/store";
import { permissionHookInputSchema } from "@/common/permissions/schema";
import type { PermissionHookOutput } from "@/lib/permissions/types";

const PANE_KEY = /^[0-9a-f-]+:[0-9a-f-]+$/;

export async function POST(request: Request) {
  const paneKey = request.headers.get("x-orca-pane") ?? "";
  const parsed = permissionHookInputSchema.safeParse(await request.json().catch(() => null));
  if (!PANE_KEY.test(paneKey) || !parsed.success || !isDashboardOpen()) {
    return Response.json({} satisfies PermissionHookOutput);
  }

  const { request: held, result } = holdPermission(paneKey, parsed.data);
  console.log("[permission-hook] held", held.id, held.toolName, paneKey);
  const timer = setTimeout(() => releasePermission(held.id), HOLD_MS);
  const onAbort = () => releasePermission(held.id);
  request.signal.addEventListener("abort", onAbort);
  try {
    const output = await result;
    console.log("[permission-hook] settled", held.id, output.hookSpecificOutput?.decision.behavior ?? "none");
    return Response.json(output);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
  }
}
