import { useQuery } from "@tanstack/react-query";
import type { DevPort, DevPortsResponse } from "@/common/devPorts/types";
import { readJson } from "@/client/shared/api/json";

const POLL_MS = 5000;
const NONE: DevPort[] = [];

async function requestDevPorts(signal: AbortSignal): Promise<DevPort[]> {
  const payload = await readJson<DevPortsResponse>(await fetch("/api/dev-ports", { cache: "no-store", signal }));
  if (!payload.ok) throw new Error(payload.error);
  return payload.ports;
}

/** Ports something started inside this worktree is listening on, polled. */
export function useDevPorts(worktreePath: string): DevPort[] {
  const query = useQuery({
    queryKey: ["dev-ports"],
    queryFn: ({ signal }) =>
      requestDevPorts(signal).catch((error: unknown) => {
        if (!signal.aborted) console.warn("[dev-ports] poll failed", error);
        throw error;
      }),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const ports = query.data?.filter((port) => port.worktreePath === worktreePath);
  return ports && ports.length > 0 ? ports : NONE;
}
