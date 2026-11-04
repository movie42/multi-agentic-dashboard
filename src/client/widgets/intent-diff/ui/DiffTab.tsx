"use client";

import type { WorktreeSummary } from "@/common/orca/types";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import { IntentDiffView } from "./IntentDiffView";
import { intentDiffHref } from "@/client/entities/intent-diff";

interface DiffTabProps {
  worktrees: WorktreeSummary[];
}

export function DiffTab({ worktrees }: DiffTabProps) {
  const [stored, writeStored] = useStoredList("agent-control:diff-worktree");
  const selected = worktrees.find((worktree) => worktree.path === stored[0]) ?? null;
  const sorted = [...worktrees].sort((a, b) => a.repo.localeCompare(b.repo) || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-[36px] leading-[1.15] font-bold tracking-[-0.025em]">변경</h1>
        <p className="mt-2.5 text-[13px] text-muted">
          워크트리를 고르면 분기점 이후 변경을 계획 항목 → 의도 순서로 보여 줘요.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-[14px]">
          <select
            value={selected?.path ?? ""}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => writeStored(event.target.value ? [event.target.value] : [])}
            className="max-w-full rounded-full bg-tint px-4 py-1.5 outline-none focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
          >
            <option value="">워크트리 고르기</option>
            {sorted.map((worktree) => (
              <option key={worktree.worktreeId} value={worktree.path}>
                {worktree.repo} · {worktree.name}
                {worktree.branch && worktree.branch !== worktree.name ? ` (${worktree.branch})` : ""}
              </option>
            ))}
          </select>
          {selected && (
            <a
              href={intentDiffHref({ worktreePath: selected.path })}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] underline decoration-faint underline-offset-[3px] hover:decoration-current"
            >
              새 창으로 열기
            </a>
          )}
        </div>
      </header>
      {selected && <IntentDiffView key={selected.path} query={{ worktreePath: selected.path }} />}
    </div>
  );
}
