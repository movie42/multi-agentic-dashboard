import type { ActionRequest, ActionResponse } from "@/lib/orca/actions";

export async function postAction(action: ActionRequest): Promise<void> {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  const payload = (await response.json()) as ActionResponse;
  if (!payload.ok) throw new Error(payload.error);
}
