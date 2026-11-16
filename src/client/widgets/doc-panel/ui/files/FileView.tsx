"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FileContent } from "@/common/files/types";
import { fileReadQueryOptions, fileStatQueryOptions, rawFileUrl } from "@/client/entities/files";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { Markdown } from "@/client/shared/ui/Markdown";
import { htmlText } from "../../lib/htmlText";
import { relativeTo } from "../../lib/paths";

const CODE_COLORS = "[&_span]:text-(color:--shiki-light) dark:[&_span]:text-(color:--shiki-dark)";
const LINK = "underline decoration-faint underline-offset-[3px] hover:decoration-current";

interface FileViewProps {
  file: string;
  /** Only the visible tab keeps checking the file for changes. */
  active: boolean;
  /** Worktree the breadcrumb starts from; the full path shows when the file is outside it. */
  root: string | null;
  className?: string;
}

type Bar = { kind: "none" } | { kind: "find" } | { kind: "goto" };

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`;
}

export function FileView({ file, active, root, className = "" }: FileViewProps) {
  const stat = useQuery({ ...fileStatQueryOptions(file), enabled: active });
  const read = useQuery({ ...fileReadQueryOptions(file, stat.data?.mtimeMs ?? null), placeholderData: keepPreviousData });
  const [bar, setBar] = useState<Bar>({ kind: "none" });
  const [markdownAsCode, setMarkdownAsCode] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const crumbs = (root && file.startsWith(root + "/") ? relativeTo(root, file) : file).split("/").filter(Boolean);

  const openInEditor = async () => {
    try {
      await postAction({ type: "open-artifact", target: file });
    } catch (error) {
      toastError("open-in-editor", error, { file });
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey && event.code === "KeyF") {
      event.preventDefault();
      setBar({ kind: "find" });
    } else if (event.ctrlKey && event.code === "KeyG") {
      event.preventDefault();
      setBar({ kind: "goto" });
    } else if (event.key === "Escape" && bar.kind !== "none") {
      event.stopPropagation();
      setBar({ kind: "none" });
      bodyRef.current?.focus();
    }
  };

  const content = read.data?.content ?? null;
  const lines = content?.kind === "text" || (content?.kind === "markdown" && markdownAsCode) ? content.lines : null;

  return (
    <div onKeyDown={onKeyDown} className={`flex min-h-0 flex-col bg-bg ${className}`}>
      <div className="flex items-center gap-3 border-b border-hair px-3 py-1.5 text-[12px]">
        <nav aria-label="파일 경로" className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-muted">
          {crumbs.map((crumb, index) => (
            <span key={`${index}-${crumb}`} className="flex min-w-0 shrink items-center gap-1 last:shrink-0">
              {index > 0 && <span aria-hidden>›</span>}
              <span className={`truncate ${index === crumbs.length - 1 ? "font-semibold text-fg" : ""}`}>{crumb}</span>
            </span>
          ))}
        </nav>
        {read.data && !stat.error && <span className="shrink-0 text-muted">{formatBytes(read.data.size)}</span>}
        {content?.kind === "markdown" && (
          <button type="button" onClick={() => setMarkdownAsCode((value) => !value)} className={`shrink-0 ${LINK}`}>
            {markdownAsCode ? "미리보기" : "코드 보기"}
          </button>
        )}
        <button type="button" onClick={() => void openInEditor()} className={`shrink-0 ${LINK}`}>
          에디터로 열기
        </button>
      </div>
      {lines && bar.kind === "find" && <FindBar lines={lines} bodyRef={bodyRef} onClose={() => setBar({ kind: "none" })} />}
      {lines && bar.kind === "goto" && <GotoBar max={lines.length} bodyRef={bodyRef} onClose={() => setBar({ kind: "none" })} />}
      <div ref={bodyRef} tabIndex={-1} className="min-h-0 flex-1 overflow-auto outline-none">
        {stat.error || read.error ? (
          <Notice>{(stat.error ?? read.error)?.message}</Notice>
        ) : !content ? (
          <Notice>불러오는 중…</Notice>
        ) : content.kind === "text" ? (
          <CodeTable lines={content.lines} />
        ) : content.kind === "markdown" && markdownAsCode ? (
          <CodeTable lines={content.lines} />
        ) : (
          <OtherContent file={file} content={content} mtimeMs={read.data?.mtimeMs ?? 0} onOpenInEditor={() => void openInEditor()} />
        )}
      </div>
    </div>
  );
}

interface NoticeProps {
  children: React.ReactNode;
}

function Notice({ children }: NoticeProps) {
  return <p className="px-5 py-8 text-[13px] text-muted">{children}</p>;
}

interface OtherContentProps {
  file: string;
  content: Exclude<FileContent, { kind: "text" }>;
  mtimeMs: number;
  onOpenInEditor: () => void;
}

function OtherContent({ file, content, mtimeMs, onOpenInEditor }: OtherContentProps) {
  if (content.kind === "markdown") {
    return (
      <div className="px-6 py-5">
        <Markdown text={content.source} />
      </div>
    );
  }
  if (content.kind === "image") {
    return (
      <div className="flex justify-center p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local file served by this app, not an optimizable asset */}
        <img src={`${rawFileUrl(file)}&v=${mtimeMs}`} alt={file} className="max-w-full border border-hair" />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2 px-5 py-8 text-[13px] text-muted">
      <p>
        {content.kind === "binary"
          ? "글자로 읽을 수 없는 파일이라 미리보기를 보여 주지 않아요."
          : `${formatBytes(content.maxBytes)}보다 큰 파일이라 미리보기를 보여 주지 않아요.`}
      </p>
      <button type="button" onClick={onOpenInEditor} className={`text-fg ${LINK}`}>
        에디터로 열기
      </button>
    </div>
  );
}

interface CodeTableProps {
  lines: readonly string[];
}

function CodeTable({ lines }: CodeTableProps) {
  return (
    <table className={`w-full border-collapse font-mono text-[12px] leading-[1.6] ${CODE_COLORS}`}>
      <tbody>
        {lines.map((html, index) => (
          <tr key={index} data-line={index + 1} className="data-[hit]:bg-ask/15 data-[current]:bg-ask/35 data-[flash]:bg-now/20">
            <td className="w-px pr-4 pl-3 text-right align-top whitespace-nowrap text-faint select-none">{index + 1}</td>
            <td className="pr-4 whitespace-pre" dangerouslySetInnerHTML={{ __html: html || " " }} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function rowOf(body: HTMLElement | null, line: number): HTMLElement | null {
  return body?.querySelector<HTMLElement>(`tr[data-line="${line}"]`) ?? null;
}

interface FindBarProps {
  lines: readonly string[];
  bodyRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

/** Marks matching rows through data attributes, so typing never re-renders the code table. */
function FindBar({ lines, bodyRef, onClose }: FindBarProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const needle = query.toLowerCase();
  const hits = needle
    ? lines.flatMap((html, index) => (htmlText(html).toLowerCase().includes(needle) ? [index + 1] : []))
    : [];
  const current = hits.length > 0 ? (hits[((cursor % hits.length) + hits.length) % hits.length] ?? null) : null;
  const hitsKey = hits.join(",");

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const marked = hitsKey ? hitsKey.split(",").map((line) => rowOf(body, Number(line))) : [];
    marked.forEach((row) => row?.setAttribute("data-hit", ""));
    const currentRow = current === null ? null : rowOf(body, current);
    currentRow?.setAttribute("data-current", "");
    currentRow?.scrollIntoView({ block: "center" });
    return () => {
      marked.forEach((row) => row?.removeAttribute("data-hit"));
      currentRow?.removeAttribute("data-current");
    };
  }, [bodyRef, hitsKey, current]);

  return (
    <div className="flex items-center gap-2 border-b border-hair bg-tint px-3 py-1.5 text-[12px]">
      <input
        autoFocus
        value={query}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          setQuery(event.target.value);
          setCursor(0);
        }}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          setCursor((value) => value + (event.shiftKey ? -1 : 1));
        }}
        placeholder="파일 안에서 찾기"
        aria-label="파일 안에서 찾기"
        className="w-56 rounded bg-bg px-2 py-0.5 outline-none focus:ring-1 focus:ring-now"
      />
      <span className="text-muted">
        {needle ? (hits.length > 0 && current !== null ? `${hits.indexOf(current) + 1}/${hits.length}줄` : "없음") : "Enter 다음 · ⇧Enter 이전"}
      </span>
      <button type="button" aria-label="찾기 닫기" onClick={onClose} className="ml-auto rounded px-1 text-muted hover:bg-tint-2 hover:text-fg">
        ×
      </button>
    </div>
  );
}

interface GotoBarProps {
  max: number;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

function GotoBar({ max, bodyRef, onClose }: GotoBarProps) {
  const [value, setValue] = useState("");
  const go = () => {
    const line = Math.max(1, Math.min(max, Number.parseInt(value, 10) || 1));
    const row = rowOf(bodyRef.current, line);
    row?.scrollIntoView({ block: "center" });
    row?.setAttribute("data-flash", "");
    window.setTimeout(() => row?.removeAttribute("data-flash"), 1200);
    onClose();
    bodyRef.current?.focus({ preventScroll: true });
  };
  return (
    <div className="flex items-center gap-2 border-b border-hair bg-tint px-3 py-1.5 text-[12px]">
      <input
        autoFocus
        inputMode="numeric"
        value={value}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setValue(event.target.value.replace(/\D/g, ""))}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          go();
        }}
        placeholder={`줄 번호 (1–${max})`}
        aria-label="줄로 이동"
        className="w-40 rounded bg-bg px-2 py-0.5 outline-none focus:ring-1 focus:ring-now"
      />
      <span className="text-muted">Enter로 이동</span>
      <button type="button" aria-label="줄 이동 닫기" onClick={onClose} className="ml-auto rounded px-1 text-muted hover:bg-tint-2 hover:text-fg">
        ×
      </button>
    </div>
  );
}
