"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardSnapshot } from "@/lib/orca/types";
import { StateBadge } from "@/client/entities/agent";

type PaletteItem =
  | { kind: "nav"; key: string; label: string; hint: string; run: () => void }
  | { kind: "project"; key: string; label: string; hint: string; run: () => void }
  | { kind: "worktree"; key: string; label: string; hint: string; run: () => void }
  | { kind: "agent"; key: string; label: string; hint: string; agentIndex: number; run: () => void };

const KIND_LABEL: Record<PaletteItem["kind"], string> = {
  nav: "이동",
  project: "프로젝트",
  worktree: "worktree",
  agent: "에이전트",
};

const MAX_ITEMS = 40;

interface CommandPaletteProps {
  board: BoardSnapshot;
  onSelectRepo: (repo: string | null) => void;
  onOpenSessions: () => void;
}

function focusCard(agentId: string, attempts = 20) {
  const card = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(agentId)}"]`);
  if (card) {
    for (let parent = card.closest("details"); parent; parent = parent.parentElement?.closest("details") ?? null) {
      parent.open = true;
    }
    card.focus();
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  if (attempts > 0) requestAnimationFrame(() => focusCard(agentId, attempts - 1));
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function CommandPalette({ board, onSelectRepo, onOpenSessions }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commandK = event.metaKey && event.code === "KeyK";
      const slash = event.code === "Slash" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target);
      if (!commandK && !slash) return;
      event.preventDefault();
      setQuery("");
      setCursor(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);
  const items: PaletteItem[] = [
    { kind: "nav", key: "nav:all", label: "전체", hint: "모든 프로젝트", run: () => onSelectRepo(null) },
    { kind: "nav", key: "nav:sessions", label: "지난 세션", hint: "닫은 Claude 세션 찾기", run: onOpenSessions },
    ...board.agents.map((agent, agentIndex) => ({
      kind: "agent" as const,
      key: `agent:${agent.id}`,
      label: agent.prompt?.replace(/\s+/g, " ") ?? agent.title ?? "(요청 없음)",
      hint: [agent.repo, agent.worktreeName, agent.branch, agent.lastMessage?.replace(/\s+/g, " ")].filter(Boolean).join(" · "),
      agentIndex,
      run: () => {
        onSelectRepo(agent.repo);
        focusCard(agent.id);
      },
    })),
    ...board.projects.map((project) => ({
      kind: "project" as const,
      key: `project:${project.repo}`,
      label: project.repo,
      hint: `worktree ${board.worktrees.filter((worktree) => worktree.repo === project.repo).length}개`,
      run: () => onSelectRepo(project.repo),
    })),
    ...board.worktrees.map((worktree) => ({
      kind: "worktree" as const,
      key: `worktree:${worktree.worktreeId}`,
      label: worktree.name,
      hint: [worktree.repo, worktree.branch, ...worktree.flowTasks.map((task) => `${task.taskId} ${task.title}`)].filter(Boolean).join(" · "),
      run: () => onSelectRepo(worktree.repo),
    })),
  ];

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = items
    .filter((item) => {
      const haystack = `${item.label} ${item.hint}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, MAX_ITEMS);
  const active = Math.min(cursor, Math.max(0, matches.length - 1));

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || (event.ctrlKey && event.code === "KeyN")) {
      event.preventDefault();
      setCursor((active + 1) % Math.max(1, matches.length));
    } else if (event.key === "ArrowUp" || (event.ctrlKey && event.code === "KeyP")) {
      event.preventDefault();
      setCursor((active - 1 + matches.length) % Math.max(1, matches.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(matches[active]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-fg/20 px-4 pt-[12vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="검색"
        className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-[14px] bg-bg shadow-[0_24px_64px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]"
        onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="에이전트, 프로젝트, worktree, 브랜치, 작업, 요청, 답변 검색"
          className="border-b border-hair bg-transparent px-5 py-4 text-[16px] outline-none placeholder:text-muted"
        />
        <ul className="overflow-y-auto py-1.5">
          {matches.length === 0 && <li className="px-5 py-4 text-[14px] text-muted">찾은 게 없어요.</li>}
          {matches.map((item, index) => (
            <li key={item.key}>
              <button
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(item)}
                className={`flex w-full items-center gap-3 px-5 py-2.5 text-left ${index === active ? "bg-tint" : ""}`}
              >
                {item.kind === "agent" ? (
                  <StateBadge agent={board.agents[item.agentIndex]} />
                ) : (
                  <span className="w-16 shrink-0 text-[11px] font-semibold text-muted">{KIND_LABEL[item.kind]}</span>
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-semibold">{item.label}</span>
                  <span className="truncate text-[12px] text-muted">{item.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-hair px-5 py-2 text-[11px] text-muted">
          ↑↓ 고르기 · Enter 이동 · esc 닫기 · 띄어쓰기로 여러 단어 함께 찾기
        </p>
      </div>
    </div>
  );
}
