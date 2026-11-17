"use client";

import { startTransition, useActionState, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GRANT_BUNDLES, type ConductorScopeKind, type GrantBundle } from "@/common/orchestration/types";
import { boardQueryOptions } from "@/client/entities/board";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { Spinner } from "@/client/shared/ui/Spinner";
import { appendDictation, DictationButton } from "@/client/shared/ui/DictationButton";

export const GRANT_LABEL: Record<GrantBundle, string> = { edit: "파일 편집", build: "테스트 · 빌드 명령", commit: "git 커밋" };
export const SCOPE_LABEL: Record<ConductorScopeKind, string> = { app: "고른 프로젝트들", project: "프로젝트 전체", worktree: "이 워크트리와 하위 워크트리" };

type LaunchResult = { kind: "idle" } | { kind: "sent" } | { kind: "error" };

interface ConductorLauncherProps {
  /** Null when opened outside any project: it then runs in its own folder and needs at least one project. */
  worktreePath: string | null;
  scope: ConductorScopeKind;
  /** Where the conductor's range is shown to the person, e.g. the project or worktree name. */
  scopeName: string;
  onClose: () => void;
  /** Called instead of `onClose` once the conductor started. */
  onLaunched?: () => void;
}

export function ConductorLauncher({ worktreePath, scope, scopeName, onClose, onLaunched = onClose }: ConductorLauncherProps) {
  const [prompt, setPrompt] = useState("");
  const [grants, setGrants] = useState<GrantBundle[]>(["edit", "build"]);
  const { data: board } = useQuery({ ...boardQueryOptions(), refetchInterval: false });
  const worktrees = board?.worktrees ?? [];
  const ownProject = worktrees.find((worktree) => worktree.path === worktreePath)?.projectPath ?? null;
  const choices = [...new Map(worktrees.map((worktree) => [worktree.projectPath, worktree.repo])).entries()]
    .filter(([path]) => path !== ownProject)
    .map(([path, repo]) => ({ path, repo }));
  // An app conductor starts with every project unless the person narrows it; others start with their own only.
  const [picked, setPicked] = useState<string[] | null>(null);
  const projects = picked ?? (scope === "app" ? choices.map((choice) => choice.path) : []);
  const needsProject = scope === "app" && projects.length === 0;
  const [result, dispatch, sending] = useActionState<LaunchResult>(async () => {
    try {
      await postAction({ type: "launch-conductor", worktreePath, prompt, scope, grants, projects });
      onLaunched();
      return { kind: "sent" };
    } catch (error) {
      toastError("launch-conductor", error);
      return { kind: "error" };
    }
  }, { kind: "idle" });

  const toggle = (grant: GrantBundle) =>
    setGrants((current) => (current.includes(grant) ? current.filter((item) => item !== grant) : [...current, grant]));
  const toggleProject = (path: string) =>
    setPicked(projects.includes(path) ? projects.filter((item) => item !== path) : [...projects, path]);
  const launch = () => {
    if (!sending && !needsProject) startTransition(() => dispatch());
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-[10px] bg-tint p-3">
      <p className="text-[14px] font-bold">
        지휘자 시작 <span className="font-normal text-muted">· {SCOPE_LABEL[scope]} ({scopeName})</span>
      </p>
      <div className="flex items-end gap-1.5">
      <textarea
        rows={2}
        autoFocus
        value={prompt}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value)}
        placeholder="지휘자에게 맡길 일 · 지휘자가 일을 나눠 워크트리 세션들에 맡기고 보고를 받아요"
        className="field-sizing-content max-h-40 min-h-12 min-w-0 flex-1 resize-none rounded-[8px] bg-bg px-3 py-2 text-[14px] leading-relaxed outline-none placeholder:text-muted"
      />
        <DictationButton onText={(text) => setPrompt((current) => appendDictation(current, text))} className="mb-1" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span className="text-muted">맡길 권한</span>
        {GRANT_BUNDLES.map((grant) => (
          <label key={grant} className="inline-flex items-center gap-1">
            <input type="checkbox" checked={grants.includes(grant)} onChange={() => toggle(grant)} />
            {GRANT_LABEL[grant]}
          </label>
        ))}
        <span className="text-muted">· git push는 맡기지 않아요</span>
      </div>
      {choices.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="mr-1 text-muted">{scope === "app" ? "맡길 프로젝트" : "함께 맡길 프로젝트"}</span>
          {choices.map((choice) => (
            <button
              key={choice.path}
              type="button"
              aria-pressed={projects.includes(choice.path)}
              onClick={() => toggleProject(choice.path)}
              title={choice.path}
              className="rounded-full px-2.5 py-0.5 leading-5 shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint-2 aria-pressed:bg-fg aria-pressed:text-bg aria-pressed:shadow-none"
            >
              {choice.repo}
            </button>
          ))}
          <span className="text-muted">· 실행 중에 더 필요하면 지휘자가 물어봐요</span>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={launch}
          disabled={sending || needsProject || result.kind === "sent"}
          className="inline-flex items-center gap-1.5 rounded-full bg-fg px-3.5 py-1.5 text-[13px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30"
        >
          {sending && <Spinner />}
          {sending ? "시작하는 중" : "지휘자 시작"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3.5 py-1.5 text-[13px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint-2"
        >
          취소
        </button>
      </div>
    </div>
  );
}
