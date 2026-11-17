"use client";

import { useState } from "react";
import type { WorktreeSummary } from "@/common/board/types";
import { ConductorLauncher } from "@/client/features/conduct-sessions";
import { LaunchAgent } from "@/client/features/launch-agent";

type LaunchMode = "session" | "conductor";

interface AllLaunchProps {
  worktrees: WorktreeSummary[];
}

/** The 전체 view's launcher: a session in any worktree, or a conductor that belongs to no project. */
export function AllLaunch({ worktrees }: AllLaunchProps) {
  const [mode, setMode] = useState<LaunchMode>("session");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex self-start rounded-full bg-tint p-0.5 text-[12px] font-semibold">
        {(["session", "conductor"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
            className="rounded-full px-3 py-1 leading-none text-muted aria-pressed:bg-fg aria-pressed:text-bg"
          >
            {option === "session" ? "새 세션" : "지휘자로 시작"}
          </button>
        ))}
      </div>
      {mode === "conductor" ? (
        <ConductorLauncher worktreePath={null} scope="app" scopeName="프로젝트 밖에서 실행" onClose={() => setMode("session")} />
      ) : (
        <LaunchAgent worktrees={worktrees} showRepo draftKey="all" />
      )}
    </div>
  );
}
