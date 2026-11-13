"use client";

import { useState } from "react";
import { gitGraphHref } from "@/client/entities/git-graph";
import { intentDiffHref } from "@/client/entities/intent-diff";
import type { WorktreeWizard } from "@/client/features/create-worktree";
import { ContextMenu, MenuHeading, MenuItem, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { Spinner } from "@/client/shared/ui/Spinner";
import type { ActionRequest } from "@/common/actions/schema";
import type { WorktreeSummary } from "@/common/orca/types";

type PickAction = "session" | "terminal" | "diff";

const PICK_LABEL: Record<PickAction, string> = {
  session: "새 세션을 띄울 워크트리",
  terminal: "터미널을 열 워크트리",
  diff: "변경을 읽을 워크트리",
};

interface IconProps {
  children: React.ReactNode;
}

function Icon({ children }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-[18px] fill-none stroke-current" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const ICONS = {
  graph: (
    <Icon>
      <circle cx="5" cy="4.5" r="1.8" />
      <circle cx="5" cy="15.5" r="1.8" />
      <circle cx="14.5" cy="8" r="1.8" />
      <path d="M5 6.3v7.4M14.5 9.8c0 3-3 3.2-9.5 4" />
    </Icon>
  ),
  diff: (
    <Icon>
      <rect x="3.5" y="2.5" width="13" height="15" rx="2" />
      <path d="M7 7h6M10 4.8v4.4M7 13.5h6" />
    </Icon>
  ),
  worktree: (
    <Icon>
      <path d="M2.5 6.5a2 2 0 0 1 2-2h3l1.6 1.8h6.4a2 2 0 0 1 2 2v6.7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" />
      <path d="M10 9.5v4M8 11.5h4" />
    </Icon>
  ),
  session: (
    <Icon>
      <path d="M3.5 5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H9l-3.5 3v-3a2 2 0 0 1-2-2z" />
      <path d="M10 5.8v5M7.5 8.3h5" />
    </Icon>
  ),
  terminal: (
    <Icon>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="m6 8 2.5 2L6 12M10.5 12.5h3.5" />
    </Icon>
  ),
};

const MENU_WIDTH = 320;

type DeckStep = "deck" | PickAction;

interface ProjectQuickMenuProps {
  worktrees: WorktreeSummary[];
  /** The Orca terminal an agent already runs in for that worktree, if any. */
  terminalOf: (worktree: WorktreeSummary) => string | null;
  onAction: (action: ActionRequest) => Promise<void>;
  wizard: WorktreeWizard;
}

/** A 빠른 메뉴 button listing the project's actions; an action that needs a worktree asks for one next. */
export function ProjectQuickMenu({ worktrees, terminalOf, onAction, wizard }: ProjectQuickMenuProps) {
  const [open, setOpen] = useState<{ at: MenuPoint; step: DeckStep } | null>(null);
  const anchor = worktrees.find((worktree) => worktree.isMain) ?? worktrees[0];
  if (!anchor) return null;

  const close = () => setOpen(null);
  const recent = [...worktrees].sort((a, b) => Number(b.isMain) - Number(a.isMain) || (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
  const pick = (action: PickAction) => {
    if (!open) return;
    if (worktrees.length === 1) {
      run(action, anchor);
      return;
    }
    setOpen({ ...open, step: action });
  };
  const run = (action: PickAction, worktree: WorktreeSummary) => {
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
    void onAction(terminalHandle ? { type: "focus-terminal", terminalHandle } : { type: "open-terminal", worktreePath: worktree.path });
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
                icon={ICONS.session}
                description="워크트리에 빈 에이전트 세션을 띄워요"
                hint={worktrees.length > 1 ? "워크트리 고르기 →" : undefined}
                onSelect={() => pick("session")}
              >
                새 세션
              </MenuItem>
              <MenuItem
                icon={ICONS.worktree}
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
                icon={ICONS.graph}
                description="모든 브랜치와 워크트리의 커밋 흐름을 새 창에서 봐요"
                onSelect={() => {
                  close();
                  window.open(gitGraphHref(anchor.path), "_blank", "noopener");
                }}
              >
                깃 그래프
              </MenuItem>
              <MenuItem
                icon={ICONS.diff}
                description="갈라진 지점 이후 바뀐 코드를 새 창에서 읽어요"
                hint={worktrees.length > 1 ? "워크트리 고르기 →" : undefined}
                onSelect={() => pick("diff")}
              >
                변경 읽기
              </MenuItem>
              <MenuItem
                icon={ICONS.terminal}
                description="Orca 앱의 터미널로 이동해요"
                hint={worktrees.length > 1 ? "워크트리 고르기 →" : undefined}
                onSelect={() => pick("terminal")}
              >
                터미널
              </MenuItem>
            </>
          ) : (
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
                <span className="text-[12px] font-semibold text-muted">{PICK_LABEL[open.step]}</span>
              </div>
              <div className="flex max-h-80 flex-col overflow-y-auto">
                {recent.map((worktree) => (
                  <MenuItem key={worktree.worktreeId} hint={worktree.isMain ? "기본" : undefined} onSelect={() => run(open.step === "deck" ? "diff" : open.step, worktree)}>
                    <span className="block truncate">{worktree.name}</span>
                    {worktree.branch && worktree.branch !== worktree.name && (
                      <span className="block truncate font-mono text-[11px] text-muted">{worktree.branch}</span>
                    )}
                  </MenuItem>
                ))}
              </div>
            </>
          )}
        </ContextMenu>
      )}
    </>
  );
}
