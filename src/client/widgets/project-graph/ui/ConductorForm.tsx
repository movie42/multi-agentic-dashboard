"use client";

import { useState } from "react";
import type { WorktreeSummary } from "@/common/board/types";
import { GRANT_BUNDLES, type GrantBundle } from "@/common/orchestration/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";

const GRANT_LABEL: Record<GrantBundle, string> = { edit: "파일 편집", test: "테스트 · 빌드 명령", commit: "git 커밋" };
const PROJECT = "@project";

interface ConductorFormProps {
  worktrees: WorktreeSummary[];
  onDone: () => void;
}

export function ConductorForm({ worktrees, onDone }: ConductorFormProps) {
  const main = worktrees.find((worktree) => worktree.isMain) ?? worktrees[0];
  const [scope, setScope] = useState(PROJECT);
  const [grants, setGrants] = useState<GrantBundle[]>(["edit", "test"]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  if (!main) return null;
  const target = worktrees.find((worktree) => worktree.worktreeId === scope) ?? null;

  const launch = async () => {
    setSending(true);
    try {
      await postAction({
        type: "launch-conductor",
        cwd: target ? target.path : main.path,
        scope: target ? { kind: "worktree", root: target.path } : { kind: "project", root: main.projectPath },
        grants,
        prompt: prompt.trim(),
      });
      onDone();
    } catch (error) {
      toastError("launch-conductor", error);
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void launch();
      }}
      className="flex flex-col gap-3 text-[13px]"
    >
      <p className="font-bold">지휘자 세션 만들기</p>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">범위 — 이 안의 워크트리에만 일꾼 세션을 열 수 있어요</span>
        <select
          value={scope}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setScope(event.target.value)}
          className="rounded-lg bg-tint px-3 py-2 outline-none"
        >
          <option value={PROJECT}>프로젝트 전체</option>
          {worktrees.map((worktree) => (
            <option key={worktree.worktreeId} value={worktree.worktreeId}>
              워크트리 {worktree.name} 와 하위
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[12px] text-muted">일꾼의 권한 요청 중 지휘자가 먼저 판단할 것 (git push는 항상 사람에게)</legend>
        <div className="flex flex-wrap gap-3">
          {GRANT_BUNDLES.map((bundle) => (
            <label key={bundle} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={grants.includes(bundle)}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setGrants((current) => (event.target.checked ? [...current, bundle] : current.filter((item) => item !== bundle)))
                }
              />
              {GRANT_LABEL[bundle]}
            </label>
          ))}
        </div>
      </fieldset>
      <textarea
        rows={3}
        value={prompt}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value)}
        placeholder="지휘자에게 맡길 목표 (예: COMP-600 하위 이슈 세 개를 워크트리별로 나눠 진행해 줘)"
        className="resize-none rounded-lg bg-tint px-3 py-2 leading-relaxed outline-none placeholder:text-muted"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-full px-4 py-1.5 font-semibold text-muted hover:text-fg">
          취소
        </button>
        <button type="submit" disabled={sending} className="rounded-full bg-focus px-4 py-1.5 font-semibold text-bg disabled:opacity-40">
          띄우기
        </button>
      </div>
    </form>
  );
}
