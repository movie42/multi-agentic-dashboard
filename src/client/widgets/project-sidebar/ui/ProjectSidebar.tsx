"use client";

import type { ProjectSummary } from "@/common/board/types";
import { formatClock } from "@/client/shared/lib/format";
import { ImportProject } from "@/client/features/import-project";
import { UsageMeter } from "@/client/entities/usage";
import type { WorkspacePrefs } from "@/client/entities/workspace";

export interface ProjectCounts {
  needsInput: number;
  needsMe: number;
  working: number;
  worktrees: number;
}

interface ProjectSidebarProps {
  projects: ProjectSummary[];
  countsByRepo: Map<string, ProjectCounts>;
  totalNeedsInput: number;
  totalNeedsMe: number;
  totalWorking: number;
  prefs: WorkspacePrefs;
  focused: Set<string>;
  onToggleFocus: (repo: string) => void;
  fetchedAt: number;
  error: string | null;
  /** Hidden at md+ only; below md the sidebar stacks above the content and stays. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const MODE_LABEL = { company: "회사", personal: "개인" } as const;

const MODE_STEPS = {
  company: "기획·질문 → 계획 → 구현 → 검증 → 테스트 → PR",
  personal: "PRD → 질문 → 기획 → 계획 → 구현 → 검증 → 테스트 → PR",
} as const;

const SHORTCUTS: [string, string][] = [
  ["⌃⌥␣", "어디서든 앱 열기·숨기기"],
  ["j k", "카드 이동"],
  ["r", "빠른 답장"],
  ["o", "첫 결과물 열기"],
  ["e", "터미널 열기"],
  ["/ ⌘K", "어디서든 검색"],
  ["esc", "입력창 나가기"],
  ["⌘ 클릭", "프로젝트를 전체 포커스에 넣고 빼기"],
];

function dotClass(needsInput: number, needsMe: number, working: number): string {
  if (needsInput > 0) return "animate-pulse bg-accent";
  if (needsMe > 0) return "bg-ask";
  if (working > 0) return "bg-now";
  return "shadow-[inset_0_0_0_1.5px_var(--faint)]";
}

interface NavItemProps {
  label: string;
  note?: string;
  active: boolean;
  focused?: boolean;
  needsInput?: number;
  needsMe: number;
  working: number;
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

function itemTone(active: boolean, focused: boolean): string {
  if (active) return `bg-bg font-semibold${focused ? " text-focus" : ""}`;
  if (focused) return "bg-focus/12 font-semibold text-focus hover:bg-focus/20";
  return "hover:bg-tint-2";
}

function NavItem({ label, note, active, focused = false, needsInput = 0, needsMe, working, onSelect }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`-mx-2 grid min-w-0 flex-1 grid-cols-[8px_1fr_auto] items-center gap-x-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-[1.4] ${itemTone(
        active,
        focused,
      )}`}
    >
      <span className={`size-2 rounded-full ${dotClass(needsInput, needsMe, working)}`} />
      <span className="truncate">
        {label}
        {note && <span className="ml-1.5 text-[12px] font-semibold text-focus">{note}</span>}
      </span>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold">
        {needsInput > 0 && (
          <span title="입력이 필요한 세션" className="rounded-full bg-accent px-1.5 py-0.5 leading-none text-accent-ink">
            입력 {needsInput}
          </span>
        )}
        {needsMe > 0 && <span className="text-ask">{needsMe}</span>}
        {working > 0 && <span className="text-now">{working}</span>}
      </span>
    </button>
  );
}

export function ProjectSidebar({
  projects,
  countsByRepo,
  totalNeedsInput,
  totalNeedsMe,
  totalWorking,
  prefs,
  focused,
  onToggleFocus,
  fetchedAt,
  error,
  collapsed,
  onToggleCollapsed,
}: ProjectSidebarProps) {
  return (
    <aside
      className={`bg-tint px-6 pt-10 pb-6 text-[14px] md:fixed md:inset-y-0 md:left-0 md:w-[var(--sidebar-w,18rem)] md:overflow-y-auto ${
        collapsed ? "md:hidden" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[18px] leading-[1.3] font-bold tracking-[-0.015em]">Agent Control</p>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="사이드바 접기"
          title="사이드바 접기 (⌘B)"
          className="-mt-0.5 -mr-2 hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-[16px] text-muted hover:bg-bg hover:text-current md:flex"
        >
          «
        </button>
      </div>
      <p className="mt-1.5 mb-6 text-[12px] text-muted">
        {error ? <span className="text-accent">갱신 실패 · </span> : null}
        {formatClock(fetchedAt)} 갱신 ·{" "}
        <a href="/runner" target="_blank" rel="noopener" className="hover:text-fg hover:underline">
          세션 러너
        </a>
      </p>
      <div className="mb-6">
        <p className="mb-2 text-[11px] font-bold tracking-[0.04em] text-muted">Claude 사용량</p>
        <UsageMeter />
      </div>

      <div className="flex">
        <NavItem
          label="전체"
          note={focused.size > 0 ? `포커스 ${focused.size}` : undefined}
          active={prefs.selectedRepo === null && !prefs.showingSessions && !prefs.showingDiff && !prefs.showingTodo}
          needsInput={totalNeedsInput}
          needsMe={totalNeedsMe}
          working={totalWorking}
          onSelect={() => prefs.selectRepo(null)}
        />
      </div>
      <div className="flex">
        <NavItem
          label="지난 세션"
          active={prefs.showingSessions}
          needsMe={0}
          working={0}
          onSelect={prefs.openSessions}
        />
      </div>
      <div className="flex">
        <NavItem label="할일" active={prefs.showingTodo} needsMe={0} working={0} onSelect={prefs.openTodo} />
      </div>
      <div className="flex">
        <NavItem label="변경" active={prefs.showingDiff} needsMe={0} working={0} onSelect={prefs.openDiff} />
      </div>

      <p className="mt-6 mb-2 text-[11px] font-bold tracking-[0.04em] text-muted">프로젝트</p>
      <div className="flex flex-col gap-px">
        {projects.map((project) => {
          const counts = countsByRepo.get(project.repo) ?? { needsInput: 0, needsMe: 0, working: 0, worktrees: 0 };
          const mode = prefs.modeOf(project);
          const inFocus = focused.has(project.repo);
          return (
            <div key={project.repo} className="flex items-center gap-3">
              <NavItem
                label={project.repo}
                active={prefs.selectedRepo === project.repo}
                focused={inFocus}
                needsInput={counts.needsInput}
                needsMe={counts.needsMe}
                working={counts.working}
                onSelect={(event) =>
                  event.metaKey || event.shiftKey
                    ? onToggleFocus(project.repo)
                    : prefs.selectRepo(project.repo)
                }
              />
              <button
                type="button"
                onClick={() => prefs.toggleMode(project)}
                title={`${MODE_LABEL[mode]} 워크플로${prefs.isModeOverridden(project.repo) ? " (직접 지정)" : " (자동)"}: ${MODE_STEPS[mode]}\n눌러서 전환`}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  mode === "company"
                    ? "text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg"
                    : "bg-tint-2 text-fg hover:bg-fg hover:text-bg"
                }`}
              >
                {MODE_LABEL[mode]}
              </button>
            </div>
          );
        })}
      </div>
      <ImportProject />

      <div className="mt-8 hidden flex-col gap-1 text-[11px] text-muted md:flex">
        <p className="mb-1 font-bold tracking-[0.04em]">단축키</p>
        {SHORTCUTS.map(([key, label]) => (
          <span key={key} className="flex items-center gap-2">
            <kbd className="min-w-7 rounded bg-bg px-1.5 py-0.5 text-center font-mono text-[10px] text-fg">{key}</kbd>
            {label}
          </span>
        ))}
      </div>
    </aside>
  );
}
