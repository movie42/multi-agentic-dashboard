"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchScreen } from "../api/runnerApi";
import { screenTail } from "../lib/screenTail";

const SCREEN_POLL_MS = 2_000;

interface TerminalTailProps {
  sessionId: string;
}

export function TerminalTail({ sessionId }: TerminalTailProps) {
  const screen = useQuery({
    queryKey: ["runner", "screen", sessionId],
    queryFn: () => fetchScreen(sessionId),
    refetchInterval: SCREEN_POLL_MS,
    staleTime: 0,
  });
  const lines = screenTail(screen.data ?? []);
  if (lines.length === 0) return null;
  return (
    <pre className="max-h-72 overflow-auto rounded-lg bg-bg px-3 py-2 font-mono text-[12px] leading-snug whitespace-pre text-fg shadow-[inset_0_0_0_1px_var(--hair)]">
      {lines.join("\n")}
    </pre>
  );
}
