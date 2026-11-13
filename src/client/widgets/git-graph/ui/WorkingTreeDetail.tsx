"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { workingDiffQueryOptions } from "@/client/entities/git-graph";
import type { WorkingFile, WorkingFileState } from "@/common/gitGraph/types";
import { DiffBlock } from "./DiffBlock";

const GROUPS: { state: WorkingFileState; title: string }[] = [
  { state: "conflicted", title: "충돌" },
  { state: "staged", title: "스테이징됨" },
  { state: "unstaged", title: "수정됨 · 스테이징 안 됨" },
  { state: "untracked", title: "새 파일" },
];

const STATUS_TEXT: Record<WorkingFile["status"], { text: string; tone: string }> = {
  A: { text: "추가", tone: "text-done" },
  M: { text: "수정", tone: "text-now" },
  D: { text: "삭제", tone: "text-accent" },
  R: { text: "이름", tone: "text-pr" },
  C: { text: "복사", tone: "text-pr" },
  T: { text: "형식", tone: "text-muted" },
  U: { text: "충돌", tone: "text-accent" },
  "?": { text: "새", tone: "text-done" },
};

interface FileDiffProps {
  worktreePath: string;
  file: string;
}

function FileDiff({ worktreePath, file }: FileDiffProps) {
  return <DiffBlock query={useQuery(workingDiffQueryOptions(worktreePath, file))} />;
}

interface WorkingTreeDetailProps {
  worktreePath: string;
  files: WorkingFile[];
  onClose: () => void;
}

export function WorkingTreeDetail({ worktreePath, files, onClose }: WorkingTreeDetailProps) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-hair pl-5 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold">커밋 안 한 변경</span>
        <button type="button" aria-label="변경 목록 닫기" onClick={onClose} className="text-[18px] leading-none text-muted hover:text-fg">
          ×
        </button>
      </div>
      {files.length === 0 && <p className="text-muted">모두 커밋됐어요.</p>}
      {GROUPS.map(({ state, title }) => {
        const group = files.filter((file) => file.state === state);
        if (group.length === 0) return null;
        return (
          <div key={state}>
            <p className="mb-1.5 text-[12px] font-semibold text-muted">
              {title} {group.length}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.map((file) => {
                const key = `${state}:${file.path}`;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-expanded={open === key}
                      onClick={() => setOpen(open === key ? null : key)}
                      className="flex w-full items-baseline gap-2 rounded-md px-1 py-0.5 text-left hover:bg-tint"
                    >
                      <span className={`w-7 shrink-0 text-[11px] font-semibold ${STATUS_TEXT[file.status].tone}`}>{STATUS_TEXT[file.status].text}</span>
                      <span className="min-w-0 font-mono text-[12px] break-all">
                        {file.from && <span className="text-muted">{file.from} → </span>}
                        {file.path}
                      </span>
                    </button>
                    {open === key && <FileDiff worktreePath={worktreePath} file={file.path} />}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </aside>
  );
}
