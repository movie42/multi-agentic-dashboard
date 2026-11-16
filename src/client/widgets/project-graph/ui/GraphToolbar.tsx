"use client";

import { useEffect, useState } from "react";
import type { WorktreeSummary } from "@/common/board/types";
import { ConductorLauncher } from "@/client/features/conduct-sessions";
import { LaunchAgent } from "@/client/features/launch-agent";

type LaunchMode = "session" | "conductor";

const TOOL =
  "inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] leading-none font-semibold hover:bg-tint aria-pressed:bg-fg aria-pressed:text-bg";
const KEY = "text-[11px] font-normal opacity-60";

interface GraphToolbarProps {
  repo: string;
  worktrees: WorktreeSummary[];
  connecting: boolean;
  showAllLinks: boolean;
  canGroup: boolean;
  showWorktreeLines: boolean;
  onToggleWorktreeLines: () => void;
  onToggleConnect: () => void;
  onToggleRules: () => void;
  onGroup: () => void;
  onTidy: () => void;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** Floating tools: new session or conductor, connect mode, the project's lines, group, tidy. */
export function GraphToolbar({ repo, worktrees, connecting, showAllLinks, canGroup, showWorktreeLines, onToggleWorktreeLines, onToggleConnect, onToggleRules, onGroup, onTidy }: GraphToolbarProps) {
  const [launch, setLaunch] = useState<LaunchMode | null>(null);
  const home = worktrees.find((worktree) => worktree.isMain) ?? worktrees[0] ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Keys typed while a card in the side panel has focus belong to the card (R = quick reply).
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest("aside")) return;
      const key = event.key.toLowerCase();
      if (key === "n") setLaunch((current) => (current ? null : "session"));
      else if (key === "c") onToggleConnect();
      else if (key === "r") onToggleRules();
      else if (key === "l") onTidy();
      else if (key === "escape") setLaunch(null);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="absolute top-4 right-4 flex w-[min(460px,calc(100%-2rem))] flex-col items-end gap-2">
      <div className="flex items-center gap-0.5 rounded-[10px] bg-bg p-1 shadow-[inset_0_0_0_1px_var(--hair)]">
        <button type="button" aria-pressed={launch !== null} onClick={() => setLaunch((current) => (current ? null : "session"))} className={TOOL}>
          + 세션 <span className={KEY}>N</span>
        </button>
        <button type="button" aria-pressed={connecting} onClick={onToggleConnect} title="켜고 상자에서 상자로 끌어 이어요" className={TOOL}>
          잇기 <span className={KEY}>C</span>
        </button>
        <button type="button" aria-pressed={showAllLinks} onClick={onToggleRules} className={TOOL}>
          규칙 <span className={KEY}>R</span>
        </button>
        <button type="button" disabled={!canGroup} onClick={onGroup} title="고른 상자를 그룹으로 묶기" className={`${TOOL} disabled:opacity-30`}>
          그룹 <span className={KEY}>⌘G</span>
        </button>
        <button type="button" aria-pressed={showWorktreeLines} onClick={onToggleWorktreeLines} title="갈라진 워크트리 · 같은 파일을 고치는 워크트리 사이 선 (git에서 계산)" className={TOOL}>
          워크트리 관계
        </button>
        <button type="button" onClick={onTidy} title="상자 자리만 처음 배치로 되돌려요. 그룹은 그대로예요." className={TOOL}>
          자동 정리 <span className={KEY}>L</span>
        </button>
      </div>
      {launch && (
        <div className="flex w-full flex-col gap-2 rounded-[12px] bg-bg p-3 shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]">
          <div className="flex self-start rounded-full bg-tint p-0.5 text-[12px] font-semibold">
            {(["session", "conductor"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={launch === mode}
                onClick={() => setLaunch(mode)}
                className="rounded-full px-3 py-1 leading-none text-muted aria-pressed:bg-fg aria-pressed:text-bg"
              >
                {mode === "session" ? "새 세션" : "지휘자로 시작"}
              </button>
            ))}
          </div>
          {launch === "conductor" && home ? (
            <ConductorLauncher worktreePath={home.path} scope="project" scopeName={repo} onClose={() => setLaunch(null)} />
          ) : (
            <LaunchAgent worktrees={worktrees} showRepo={false} draftKey={`project:${repo}`} />
          )}
        </div>
      )}
    </div>
  );
}
