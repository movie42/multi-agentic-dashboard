"use client";

import type { ActionRequest } from "@/lib/orca/actions";
import type { FeatureCheck, FeatureSummary, FileOverlap, SharedWait } from "@/lib/workflow/types";
import { formatClock } from "@/client/shared/lib/format";

interface FeatureGroupProps {
  feature: FeatureSummary;
  onAction: (action: ActionRequest) => void;
  children: React.ReactNode;
}

const OVERLAP_FILES_SHOWN = 3;

function sharedWaitLine(wait: SharedWait): string {
  const usedBy = wait.usedBy.length > 0 ? ` · 쓰는 곳 ${wait.usedBy.join(", ")}` : "";
  if (wait.reason.kind === "unresolved") {
    return `공용 작업 ${wait.item}: 만드는 곳(${wait.reason.buildIn || "비어 있음"})을 찾지 못했어요${usedBy}`;
  }
  const pr = wait.reason.pullRequest;
  const state =
    pr.kind === "found"
      ? `PR #${pr.number} ${pr.state === "CLOSED" ? "닫힘" : pr.isDraft ? "초안" : "리뷰 중"}`
      : pr.kind === "none"
        ? "PR 없음"
        : pr.kind === "loading"
          ? "PR 확인 중"
          : "PR 확인 실패";
  return `공용 작업 대기 · ${wait.item} — ${wait.reason.branch} ${state}${usedBy}`;
}

function overlapLines(overlaps: FileOverlap[]): string[] {
  const byPair = new Map<string, { label: string; files: string[] }>();
  for (const overlap of overlaps) {
    const key = [overlap.worktree, overlap.otherWorktree].sort().join("\u0000");
    const entry = byPair.get(key) ?? {
      label: `${overlap.worktree} ↔ ${overlap.otherWorktree}${overlap.otherBranch ? ` (${overlap.otherBranch})` : ""}`,
      files: [],
    };
    if (!entry.files.includes(overlap.file)) entry.files.push(overlap.file);
    byPair.set(key, entry);
  }
  return [...byPair.values()].map(({ label, files }) => {
    const shown = files.slice(0, OVERLAP_FILES_SHOWN).join(", ");
    const rest = files.length > OVERLAP_FILES_SHOWN ? ` 외 ${files.length - OVERLAP_FILES_SHOWN}개` : "";
    return `같은 파일 수정 · ${label}: ${shown}${rest}`;
  });
}

function checkLines(check: FeatureCheck): string[] {
  if (check.kind === "failed") return [`원격 확인 실패 · ${check.error}`];
  if (check.kind !== "done") return [];
  return [
    ...check.behind.map(
      (entry) => `rebase 필요 · ${entry.worktree}: origin/${check.root}에 아직 받지 않은 커밋 ${entry.commits}개`,
    ),
    ...overlapLines(check.overlaps),
  ];
}

function checkStatus(check: FeatureCheck): string {
  if (check.kind === "idle") return "원격 확인 안 함";
  if (check.kind === "running") return "확인 중…";
  if (check.kind === "failed") return `${formatClock(check.at)} 확인 실패`;
  const clean = check.behind.length === 0 && check.overlaps.length === 0;
  return `${formatClock(check.at)} 확인${clean ? " · 문제 없음" : ""}`;
}

export function FeatureGroup({ feature, onAction, children }: FeatureGroupProps) {
  const warnings = [...checkLines(feature.check), ...feature.sharedWaits.map(sharedWaitLine)];
  const pageIndex = feature.pageIndex;
  const canCheck = Boolean(feature.root) && feature.check.kind !== "running";

  return (
    <section data-jump={`feature:${feature.id}`} className="scroll-mt-6 border-t-2 border-fg pt-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[22px] leading-[1.3] font-bold tracking-[-0.015em]">{feature.title}</h2>
        <span className="font-mono text-[12px] text-muted">
          기능 {feature.id}
          {feature.root && ` · 루트 ${feature.root}`}
        </span>
        <span className="ml-auto flex shrink-0 items-baseline gap-3 text-[13px]">
          {pageIndex && (
            <button
              type="button"
              onClick={() => onAction({ type: "open-artifact", target: pageIndex, via: "system", worktreePath: feature.repoPath ?? "" })}
              className="underline decoration-faint underline-offset-[3px] hover:decoration-current"
            >
              기능 문서 열기
            </button>
          )}
          <span className="text-muted">{checkStatus(feature.check)}</span>
          <button
            type="button"
            disabled={!canCheck}
            onClick={() => onAction({ type: "check-feature", featureId: feature.id })}
            title={feature.root ? `git fetch origin ${feature.root} 후 rebase 필요 · 같은 파일 수정을 확인해요` : "기능 문서에 루트 브랜치가 없어요"}
            className="rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent"
          >
            원격 확인
          </button>
        </span>
      </div>
      {warnings.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-[13px] text-ask">
          {warnings.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <div className="mt-2">{children}</div>
    </section>
  );
}
