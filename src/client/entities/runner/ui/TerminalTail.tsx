"use client";

import { useTerminalScreen } from "../model/useTerminalScreen";

interface TerminalTailProps {
  sessionId: string;
}

export function TerminalTail({ sessionId }: TerminalTailProps) {
  const lines = useTerminalScreen(sessionId);
  if (lines.length === 0) return null;
  return (
    <pre className="max-h-72 overflow-auto rounded-lg bg-bg px-3 py-2 font-mono text-[12px] leading-snug whitespace-pre text-fg shadow-[inset_0_0_0_1px_var(--hair)]">
      {lines.join("\n")}
    </pre>
  );
}
