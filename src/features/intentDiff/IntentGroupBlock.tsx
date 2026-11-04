"use client";

import { createContext, useContext } from "react";
import type { FeatureFile, FileDiff, Hunk, IntentGroup, IntentSource } from "@/lib/intentDiff/types";
import { HunkBlock } from "./HunkBlock";

export interface HunkEntry {
  file: FileDiff;
  hunk: Hunk;
  /** The file's place in the import graph of changed files. */
  node: FeatureFile | null;
}

export const HunkLookup = createContext<Map<string, HunkEntry>>(new Map());

const SOURCE_LABEL: Record<IntentSource, string> = {
  todo: "할 일 항목",
  narration: "에이전트 설명",
  prompt: "사용자 요청",
};

function clock(at: number): string {
  return new Date(at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface IntentGroupBlockProps {
  group: IntentGroup;
}

export function IntentGroupBlock({ group }: IntentGroupBlockProps) {
  const lookup = useContext(HunkLookup);
  const outside = new Set(group.outsidePlanFiles);
  const fileCount = new Set(group.hunks.map((ref) => lookup.get(ref.hunkId)?.file.file)).size;

  return (
    <article id={`group-${group.id}`} className="flex scroll-mt-6 flex-col gap-3">
      <header>
        <h4 className="text-[15px] leading-[1.45] font-semibold">{group.title}</h4>
        <p className="mt-1 flex flex-wrap gap-x-2 text-[12px] text-muted">
          <span>{SOURCE_LABEL[group.source]}</span>
          <span>{clock(group.startedAt)}</span>
          <span>
            파일 {fileCount} · 조각 {group.hunks.length}
          </span>
        </p>
        {group.outsidePlanFiles.length > 0 && (
          <p className="mt-1.5 text-[12px] text-ask">
            계획 항목에 없는 파일 {group.outsidePlanFiles.length}개를 같은 시점에 고쳤어요
          </p>
        )}
        {group.notes.length > 0 && (
          <details className="mt-2 text-[13px]">
            <summary className="cursor-pointer text-muted hover:text-fg">기록된 설명 {group.notes.length}개</summary>
            <ul className="mt-2 flex flex-col gap-2 border-l-2 border-hair pl-3">
              {group.notes.map((note, index) => (
                <li key={index} className="leading-[1.6] whitespace-pre-wrap">
                  {note}
                </li>
              ))}
            </ul>
          </details>
        )}
      </header>
      {group.hunks.map((ref) => {
        const entry = lookup.get(ref.hunkId);
        if (!entry) return null;
        return (
          <HunkBlock
            key={ref.hunkId}
            file={entry.file}
            hunk={entry.hunk}
            precision={ref.precision}
            note={outside.has(entry.file.file) ? "계획 파일 밖" : undefined}
            links={entry.node}
          />
        );
      })}
    </article>
  );
}
