import { services } from "@/server/container";
import type { RuntimeMode, RuntimeStatus } from "@/server/orca/runtimeMode";

export { ORCA_BUNDLE_ID } from "@/server/orca/OrcaRuntime";
export type { RuntimeMode, RuntimeResponse } from "@/server/orca/runtimeMode";

export function readRuntime(): Promise<RuntimeStatus> {
  return services().orca.runtime.read();
}

export function switchRuntime(target: Exclude<RuntimeMode, "off">): Promise<RuntimeMode> {
  return services().orca.runtime.switchTo(target);
}
