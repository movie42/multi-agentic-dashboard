"use client";

import { useState } from "react";
import { gitGraphHref } from "@/client/entities/git-graph";
import { intentDiffHref } from "@/client/entities/intent-diff";
import type { WorktreeWizard } from "@/client/features/create-worktree";
import { RemoveWorktree } from "@/client/features/remove-worktree";
import { ContextMenu, MenuHeading, MenuItem, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { ACTION_ICONS } from "@/client/shared/ui/ActionIcons";
import { Spinner } from "@/client/shared/ui/Spinner";
import type { ActionRequest } from "@/common/actions/schema";
import type { WorktreeSummary } from "@/common/board/types";

type PickAction = "session" | "terminal" | "diff" | "remove";

const PICK_LABEL: Record<PickAction, string> = {
  session: "새 세션을 띄울 워크트리",
  terminal: "터미널을 열 워크트리",
  diff: "변경을 읽을 워크트리",
  remove: "지울 워크트리",
};

const MENU_WIDTH = 320;

type DeckStep = "deck" | PickAction | "confirm-remove";

interface ProjectQuickMenuProps {
  worktrees: WorktreeSummary[];
  /** The session an agent already runs in for that worktree, if any. */
  terminalOf: (worktree: WorktreeSummary) => string | null;
  /** Agent sessions attached to the worktree; removing it closes them. */
  sessionCountOf: (worktree: WorktreeSummary) => number;
  onAction: (action: ActionRequest) => Promise<void>;
  wizard: WorktreeWizard;
}

/** A 빠른 메뉴 button listing the project's actions; an action that needs a worktree asks for one next. */
export function ProjectQuickMenu({ worktrees, terminalOf, sessionCountOf, onAction, wizard }: ProjectQuickMenuProps) {
  const [open, setOpen] = useState<{ at: MenuPoint; step: DeckStep; target?: WorktreeSummary } | null>(null);
  const anchor = worktrees.find((worktree) => worktree.isMain) ?? worktrees[0];
  if (!anchor) return null;

  const close = () => setOpen(null);
  const recent = [...worktrees].sort((a, b) => Number(b.isMain) - Number(a.isMain) || (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
  const removable = recent.filter((worktree) => !worktree.isMain);
  const candidatesOf = (action: PickAction) => (action === "remove" ? removable : recent);
  const picking: PickAction | null = open && open.step !== "deck" && open.step !== "confirm-remove" ? open.step : null;
  const pick = (action: PickAction) => {
    if (!open) return;
    const [only, ...rest] = candidatesOf(action);
    if (only && rest.length === 0) {
      run(action, only);
      return;
    }
    setOpen({ ...open, step: action });
  };
  const run = (action: PickAction, worktree: WorktreeSummary) => {
    if (action === "remove") {
      if (open) setOpen({ ...open, step: "confirm-remove", target: worktree });
      return;
    }
    close();
    if (action === "diff") {
      window.open(intentDiffHref({ worktreePath: worktree.path }), "_blank", "noopener");
      return;
    }
    if (action === "session") {
      void onAction({ type: "launch-agent", worktreePath: worktree.path, prompt: "" });
      return;
    }
    const terminalHandle = terminalOf(worktree);
    if (terminalHandle) {
      window.open(`/runner?session=${encodeURIComponent(terminalHandle)}`, "_blank", "noopener");
      return;
    }
    void onAction({ type: "open-terminal", worktreePath: worktree.path });
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        disabled={wizard.busy}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setOpen(open ? null : { at: { x: rect.right - MENU_WIDTH, y: rect.bottom + 6 }, step: "deck" });
        }}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold disabled:cursor-progress ${
          open ? "bg-fg text-bg" : "bg-bg shadow-[0_6px_20px_-10px_var(--faint),inset_0_0_0_1px_var(--hair)] hover:bg-tint"
        }`}
      >
        {wizard.busy ? (
          <Spinner />
        ) : (
          <svg aria-hidden viewBox="0 0 16 16" className="size-4 fill-current">
            {[3, 8, 13].flatMap((cy) => [3, 8, 13].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.5} />))}
          </svg>
        )}
        빠른 메뉴
      </button>
      {open && (
        <ContextMenu key={open.step} at={open.at} label="프로젝트 빠른 메뉴" onClose={close} widthClass="w-[320px]">
          {open.step === "deck" ? (
            <>
              <MenuHeading>이 프로젝트에서 · 워크트리가 필요한 항목은 다음에 골라요</MenuHeading>
              <MenuItem
                icon={ACTION_ICONS.session}
                description="워크트리에 빈 에이전트 세션을 띄워요"
                hint={worktrees.length > 1 ? "워크트리 고르기 →" : undefined}
                onSelect={() => pick("session")}
              >
                새 세션
              </MenuItem>
              <MenuItem
                icon={ACTION_ICONS.worktree}
                description="기본 브랜치에서 새 작업 폴더를 만들어요"
                onSelect={() => {
                  close();
                  wizard.open();
                }}
              >
                새 워크트리
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={ACTION_ICONS.graph}
                description="모든 브랜치와 워크트리의 커밋 흐름을 새 창에서 봐요"
                onSelect={() => {
                  close();
                  window.open(gitGraphHref(anchor.path), "_blank", "noopener");
                }}
              >
                깃 그래프
              </MenuItem>
              <MenuItem
                icon={ACTION_ICONS.diff}
                description="갈라진 지점 이후 바뀐 코드를 새 창에서 읽어요"
                hint={worktrees.length > 1 ? "워크트리 고르기 →" : undefined}
                onSelect={() => pick("diff")}
              >
                변경 읽기
              </MenuItem>
              <MenuItem
                icon={ACTION_ICONS.terminal}
                description="이 워크트리의 터미널을 열어요"
                hint={worktrees.length > 1 ? "워크트리 고르기 →" : undefined}
                onSelect={() => pick("terminal")}
              >
                터미널
              </MenuItem>
              {removable.length > 0 && (
                <>
                  <MenuSeparator />
                  <MenuItem
                    icon={ACTION_ICONS.remove}
                    tone="danger"
                    description="워크트리를 지워요. 브랜치는 남아요"
                    hint={removable.length > 1 ? "워크트리 고르기 →" : undefined}
                    onSelect={() => pick("remove")}
                  >
                    워크트리 삭제
                  </MenuItem>
                </>
              )}
            </>
          ) : open.step === "confirm-remove" && open.target ? (
            <div className="px-1 pb-1">
              <RemoveWorktree
                worktree={open.target}
                sessionCount={sessionCountOf(open.target)}
                onCancel={() => setOpen({ ...open, step: "deck", target: undefined })}
              />
            </div>
          ) : picking ? (
            <>
              <div className="flex items-center gap-1 px-1 pb-1">
                <button
                  type="button"
                  aria-label="빠른 메뉴로 돌아가기"
                  onClick={() => setOpen({ ...open, step: "deck" })}
                  className="rounded-md px-1.5 text-[15px] leading-6 text-muted hover:bg-tint hover:text-fg"
                >
                  ←
                </button>
                <span className="text-[12px] font-semibold text-muted">
                  {PICK_LABEL[picking]}
                </span>
              </div>
              <div className="flex max-h-80 flex-col overflow-y-auto">
                {candidatesOf(picking).map((worktree) => (
                  <MenuItem key={worktree.worktreeId} hint={worktree.isMain ? "기본" : undefined} onSelect={() => run(picking, worktree)}>
                    <span className="block truncate">{worktree.name}</span>
                    {worktree.branch && worktree.branch !== worktree.name && (
                      <span className="block truncate font-mono text-[11px] text-muted">{worktree.branch}</span>
                    )}
                  </MenuItem>
                ))}
              </div>
            </>
          ) : null}
        </ContextMenu>
      )}
    </>
  );
}
