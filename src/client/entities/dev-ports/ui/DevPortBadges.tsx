"use client";

import { useDevPorts } from "../api/devPortsQuery";

interface DevPortBadgesProps {
  worktreePath: string;
}

/** One pill per port a process started in this worktree listens on; clicking opens it in the browser. */
export function DevPortBadges({ worktreePath }: DevPortBadgesProps) {
  const ports = useDevPorts(worktreePath);
  if (ports.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {ports.map((port) => (
        <button
          key={`${port.pid}:${port.port}`}
          type="button"
          onClick={() => window.open(`http://localhost:${port.port}`, "_blank", "noopener")}
          title={`${port.command} (pid ${port.pid})가 ${port.port} 포트에서 듣고 있어요\n누르면 브라우저로 열어요`}
          className="flex shrink-0 items-center gap-1 rounded-full bg-bg px-2 py-1 font-mono font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint-2"
        >
          <span className="size-1.5 rounded-full bg-done" aria-hidden />:{port.port}
        </button>
      ))}
    </span>
  );
}
