"use client";

import type { FeatureFile, FileDiff, Hunk, HunkPrecision } from "@/common/intentDiff/types";
import { CodeLines } from "./CodeLines";

const CHANGE_LABEL: Record<FileDiff["change"], string> = {
  modified: "수정",
  added: "새 파일",
  deleted: "삭제",
  renamed: "이름 변경",
};

const PRECISION: Record<HunkPrecision, { label: string; title: string; className: string }> = {
  exact: {
    label: "기록",
    title: "도구 호출이 바꾼 줄이 기록과 일치해요",
    className: "text-done shadow-[inset_0_0_0_1px_var(--st-done)]",
  },
  file: {
    label: "추정",
    title: "이 파일을 건드린 도구 호출로 묶었어요. 어느 줄인지는 기록에 없어요",
    className: "text-ask shadow-[inset_0_0_0_1px_var(--st-ask)]",
  },
  none: {
    label: "기록 없음",
    title: "이 줄을 만든 도구 호출을 찾지 못했어요",
    className: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
  },
};

interface HunkBlockProps {
  file: FileDiff;
  hunk: Hunk;
  precision: HunkPrecision | null;
  note?: string;
  /** When given, shows which changed files this one imports and which import it. */
  links?: FeatureFile | null;
}

function baseName(file: string): string {
  return file.split("/").pop() ?? file;
}

export function HunkBlock({ file, hunk, precision, note, links }: HunkBlockProps) {
  const badge = precision ? PRECISION[precision] : null;

  return (
    <div className="overflow-hidden rounded-lg border border-hair" data-file={file.file}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 bg-tint px-3 py-2 text-[12px]">
        <span className="font-mono font-semibold break-all">{file.file}</span>
        {file.oldFile && <span className="font-mono text-muted">← {file.oldFile}</span>}
        <span className="text-muted">{CHANGE_LABEL[file.change]}</span>
        {hunk.header && <span className="truncate font-mono text-muted">{hunk.header}</span>}
        {note && <span className="text-ask">{note}</span>}
        {badge && (
          <span title={badge.title} className={`ml-auto rounded-full px-2 py-px text-[11px] font-semibold ${badge.className}`}>
            {badge.label}
          </span>
        )}
      </div>
      {links && (links.imports.length > 0 || links.importedBy.length > 0) && (
        <p className="flex flex-wrap gap-x-3 border-t border-hair px-3 py-1 text-[11px] text-muted">
          {links.importedBy.length > 0 && (
            <span title={links.importedBy.join("\n")}>쓰는 곳 ← {links.importedBy.map(baseName).join(", ")}</span>
          )}
          {links.imports.length > 0 && <span title={links.imports.join("\n")}>가져옴 → {links.imports.map(baseName).join(", ")}</span>}
        </p>
      )}
      {hunk.lines.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-muted">
          {file.binary ? "바이너리 파일이라 내용을 보여 주지 않아요." : "내용 변경 없이 이름이나 권한만 바뀌었어요."}
        </p>
      ) : (
        <CodeLines file={file.file} lines={hunk.lines} />
      )}
    </div>
  );
}
