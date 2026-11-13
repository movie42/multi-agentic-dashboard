"use client";

import { useEffect, useRef } from "react";
import { Spinner } from "@/client/shared/ui/Spinner";
import { usePendingLaunches } from "../model/pendingLaunchStore";

interface PendingLaunchRowsProps {
  worktreePath: string;
  /** True when no session list sits above, so the rows draw their own top rule. */
  standalone: boolean;
}

/** Placeholder rows for sessions that were asked for but are not yet on the board. */
export function PendingLaunchRows({ worktreePath, standalone }: PendingLaunchRowsProps) {
  const pending = usePendingLaunches(worktreePath);
  const firstRef = useRef<HTMLLIElement>(null);
  const firstId = pending[0]?.id;

  useEffect(() => {
    if (firstId) firstRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [firstId]);

  if (pending.length === 0) return null;
  return (
    <ul aria-live="polite" className={standalone ? "border-t border-hair" : ""}>
      {pending.map((entry, index) => (
        <li
          key={entry.id}
          ref={index === 0 ? firstRef : undefined}
          className="flex scroll-mt-6 items-center gap-3 border-b border-hair py-3 pl-4 text-[14px] text-muted"
        >
          <Spinner className="text-now" />
          <span className="shrink-0">새 세션을 여는 중…</span>
          <span aria-hidden className="h-2.5 max-w-64 flex-1 animate-pulse rounded-full bg-tint-2 motion-reduce:animate-none" />
        </li>
      ))}
    </ul>
  );
}
