"use client";

import type { WorktreeSummary } from "@/common/board/types";
import { requestCommandManage, requestCommandRun, useProjectCommands } from "@/client/entities/project-commands";

interface WorktreeCommandButtonsProps {
  worktree: WorktreeSummary;
}

export function WorktreeCommandButtons({ worktree }: WorktreeCommandButtonsProps) {
  const commands = useProjectCommands(worktree.projectPath);
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {commands.map((command) => (
        <button
          key={command.name}
          type="button"
          onClick={() => requestCommandRun(worktree, command)}
          title={`${command.command}\n이 워크트리 브랜치로 돌려요`}
          className="shrink-0 rounded-full bg-bg px-2 py-1 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint-2"
        >
          {command.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => requestCommandManage(worktree, commands.length > 0 ? "edit" : "register")}
        title={commands.length > 0 ? "에이전트에게 명령을 고쳐 달라고 해요" : "에이전트가 저장소를 읽고 버튼으로 둘 명령을 찾아요"}
        className="shrink-0 px-1 text-muted hover:text-fg"
      >
        {commands.length > 0 ? "명령 수정" : "+ 명령 등록"}
      </button>
    </span>
  );
}
