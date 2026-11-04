"use client";

import { useState } from "react";
import type { FeatureFile, FileDiff, Hunk, HunkPrecision } from "@/lib/intentDiff/types";

const PREVIEW_LINES = 100;

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

const LINE_STYLE = {
  add: "bg-done/10",
  del: "bg-accent/10",
  ctx: "",
} as const;

const LINE_MARK = { add: "+", del: "−", ctx: " " } as const;

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
  const [expanded, setExpanded] = useState(false);
  const lines = expanded ? hunk.lines : hunk.lines.slice(0, PREVIEW_LINES);
  const hidden = hunk.lines.length - lines.length;
  const badge = precision ? PRECISION[precision] : null;

  return (
    <div className="overflow-hidden rounded-lg border border-hair">
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[12px] leading-[1.55]">
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className={LINE_STYLE[line.kind]}>
                  <td className="w-10 px-2 text-right align-top text-faint select-none">{line.oldNo ?? ""}</td>
                  <td className="w-10 px-2 text-right align-top text-faint select-none">{line.newNo ?? ""}</td>
                  <td className="w-4 align-top text-muted select-none">{LINE_MARK[line.kind]}</td>
                  <td className="pr-3 whitespace-pre">{line.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full border-t border-hair px-3 py-1.5 text-left text-[12px] text-muted hover:bg-tint"
            >
              {hidden}줄 더 보기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
