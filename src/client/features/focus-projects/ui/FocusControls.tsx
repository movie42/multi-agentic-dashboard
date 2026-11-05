"use client";

interface FocusToggleProps {
  active: boolean;
  onToggle: () => void;
}

export function FocusToggle({ active, onToggle }: FocusToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      title={active ? "전체 화면 포커스에서 빼기" : "전체 화면에 이 프로젝트를 모아 보기"}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] leading-none font-semibold tracking-normal ${
        active ? "bg-focus text-bg hover:opacity-85" : "bg-tint text-muted hover:text-fg"
      }`}
    >
      {active ? "포커스 중" : "포커스"}
    </button>
  );
}

interface FocusChipsProps {
  repos: string[];
  onRemove: (repo: string) => void;
  onClear: () => void;
}

export function FocusChips({ repos, onRemove, onClear }: FocusChipsProps) {
  if (repos.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
      <span className="mr-1 font-bold text-focus">포커스</span>
      {repos.map((repo) => (
        <button
          key={repo}
          type="button"
          onClick={() => onRemove(repo)}
          title={`${repo}을 포커스에서 빼기`}
          className="flex items-center gap-1.5 rounded-full bg-focus px-3 py-1 leading-5 font-semibold text-bg hover:opacity-85"
        >
          {repo}
          <span aria-hidden className="opacity-70">
            ×
          </span>
        </button>
      ))}
      <button type="button" onClick={onClear} className="ml-1.5 text-muted hover:text-fg">
        모두 해제
      </button>
    </div>
  );
}
