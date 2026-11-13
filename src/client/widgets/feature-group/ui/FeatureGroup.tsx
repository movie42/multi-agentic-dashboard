"use client";

import type { ActionRequest } from "@/common/actions/schema";
import type { FeatureSummary, SharedWait } from "@/common/workflow/types";

interface FeatureGroupProps {
  feature: FeatureSummary;
  onAction: (action: ActionRequest) => Promise<void>;
  children: React.ReactNode;
}

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

export function FeatureGroup({ feature, onAction, children }: FeatureGroupProps) {
  const warnings = feature.sharedWaits.map(sharedWaitLine);
  const pageIndex = feature.pageIndex;

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
              onClick={() => onAction({ type: "open-artifact", target: pageIndex })}
              className="underline decoration-faint underline-offset-[3px] hover:decoration-current"
            >
              기능 문서 열기
            </button>
          )}
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
