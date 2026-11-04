import { services } from "@/server/container";
import type { ActivityStep } from "./types";

export { stepsOf } from "@/server/sessions/activitySteps";

export function readActivity(sessionId: string): Promise<{ steps: ActivityStep[]; updatedAt: number }> {
  return services().activity.read(sessionId);
}
