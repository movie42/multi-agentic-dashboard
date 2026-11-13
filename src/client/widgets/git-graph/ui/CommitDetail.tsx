"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { commitDetailQueryOptions, commitDiffQueryOptions } from "@/client/entities/git-graph";
import type { FileChange, FileChangeStatus } from "@/common/gitGraph/types";
import { DiffBlock } from "./DiffBlock";
import { formatCommitTime } from "./GraphRow";

const STATUS_LABEL: Record<FileChangeStatus, { text: string; tone: string }> = {
  A: { text: "추가", tone: "text-done" },
  M: { text: "수정", tone: "text-now" },
  D: { text: "삭제", tone: "text-accent" },
  R: { text: "이름", tone: "text-pr" },
  C: { text: "복사", tone: "text-pr" },
  T: { text: "형식", tone: "text-muted" },
};

interface CommitFileDiffProps {
  worktreePath: string;
  sha: string;
  file: FileChange;
}

function CommitFileDiff({ worktreePath, sha, file }: CommitFileDiffProps) {
  return <DiffBlock query={useQuery(commitDiffQueryOptions(worktreePath, sha, file.path, file.from))} />;
}

interface CommitDetailProps {
  worktreePath: string;
  sha: string;
  onClose: () => void;
  onSelectParent: (sha: string) => void;
}

export function CommitDetail({ worktreePath, sha, onClose, onSelectParent }: CommitDetailProps) {
  const { data: commit, error, isPending } = useQuery(commitDetailQueryOptions(worktreePath, sha));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-hair pl-5 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[12px] text-muted">{sha.slice(0, 10)}</span>
        <button type="button" aria-label="커밋 상세 닫기" onClick={onClose} className="text-[18px] leading-none text-muted hover:text-fg">
          ×
        </button>
      </div>
      {isPending && <p className="text-muted">불러오는 중…</p>}
      {error && <p className="text-accent">{error.message}</p>}
      {commit && (
        <>
          <p className="text-[15px] leading-relaxed font-semibold break-words whitespace-pre-wrap">{commit.message}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-muted">작성자</dt>
            <dd className="truncate">
              {commit.author} <span className="text-muted">&lt;{commit.email}&gt;</span>
            </dd>
            <dt className="text-muted">시간</dt>
            <dd>{formatCommitTime(commit.time)}</dd>
            <dt className="text-muted">부모</dt>
            <dd className="flex flex-wrap gap-1.5">
              {commit.parents.length === 0 && <span className="text-muted">없음 (첫 커밋)</span>}
              {commit.parents.map((parent) => (
                <button key={parent} type="button" onClick={() => onSelectParent(parent)} className="font-mono underline decoration-faint underline-offset-2 hover:decoration-current">
                  {parent.slice(0, 7)}
                </button>
              ))}
            </dd>
          </dl>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-muted">
              바뀐 파일 {commit.files.length}
              {commit.parents.length > 1 && " · 첫 번째 부모와 비교"}
            </p>
            <ul className="flex flex-col gap-0.5">
              {commit.files.map((file) => {
                const key = `${file.status}:${file.from ?? ""}:${file.path}`;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-expanded={open === key}
                      onClick={() => setOpen(open === key ? null : key)}
                      className="flex w-full items-baseline gap-2 rounded-md px-1 py-0.5 text-left hover:bg-tint"
                    >
                      <span className={`w-7 shrink-0 text-[11px] font-semibold ${STATUS_LABEL[file.status].tone}`}>{STATUS_LABEL[file.status].text}</span>
                      <span className="min-w-0 font-mono text-[12px] break-all">
                        {file.from && <span className="text-muted">{file.from} → </span>}
                        {file.path}
                      </span>
                    </button>
                    {open === key && <CommitFileDiff worktreePath={worktreePath} sha={sha} file={file} />}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}
