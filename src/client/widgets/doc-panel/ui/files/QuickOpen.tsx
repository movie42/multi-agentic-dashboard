"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { fileSearchQueryOptions } from "@/client/entities/files";
import { rankFiles, useFileExplorerStore } from "@/client/features/browse-files";
import { useDocViewerStore } from "@/client/features/view-doc";
import { baseName } from "../../lib/paths";
import { FileIcon } from "./FileIcon";
import { HitLabel } from "./FileTree";

const MAX_ITEMS = 50;

interface QuickOpenProps {
  /** Used when the tree has not been opened yet: the worktree on screen. */
  fallbackRoot: string | null;
}

/** ⌘P: find a file by name in the worktree the tree shows, as VS Code's quick open does. */
export function QuickOpen({ fallbackRoot }: QuickOpenProps) {
  const treeRoot = useFileExplorerStore((state) => state.root);
  const treeOpen = useFileExplorerStore((state) => state.treeOpen);
  const root = (treeOpen ? treeRoot : null) ?? fallbackRoot ?? treeRoot;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.code !== "KeyP" || event.shiftKey) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open || !root) return null;
  return <QuickOpenDialog root={root} onClose={() => setOpen(false)} />;
}

interface QuickOpenDialogProps {
  root: string;
  onClose: () => void;
}

function QuickOpenDialog({ root, onClose }: QuickOpenDialogProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [all, setAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, error, isPending } = useQuery(fileSearchQueryOptions(root, all));
  const openFile = useDocViewerStore((state) => state.openFile);
  const show = useFileExplorerStore((state) => state.show);
  const hits = data && query.trim() ? rankFiles(query, data.files, MAX_ITEMS) : [];
  const active = Math.min(cursor, Math.max(0, hits.length - 1));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const choose = (relative: string | undefined, preview: boolean) => {
    if (!relative) return;
    onClose();
    show(root);
    openFile(`${root}/${relative}`, { preview });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowDown" || (event.ctrlKey && event.code === "KeyN")) {
      event.preventDefault();
      setCursor((active + 1) % Math.max(1, hits.length));
    } else if (event.key === "ArrowUp" || (event.ctrlKey && event.code === "KeyP")) {
      event.preventDefault();
      setCursor((active - 1 + hits.length) % Math.max(1, hits.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(hits[active]?.path, !event.metaKey);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-fg/20 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="파일 찾기"
        className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-[14px] bg-bg shadow-[0_24px_64px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]"
        onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={`${baseName(root)}에서 파일 이름으로 찾기`}
          aria-label="파일 이름"
          className="border-b border-hair bg-transparent px-4 py-3 text-[15px] outline-none placeholder:text-muted"
        />
        <div className="flex items-center gap-3 border-b border-hair px-4 py-1.5 text-[12px] text-muted">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={all} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAll(event.target.checked)} />
            전부 검색 (node_modules · .git 포함)
          </label>
          <span className="ml-auto">Enter 열기 · ⌘Enter 고정해서 열기</span>
        </div>
        <ul role="listbox" aria-label="찾은 파일" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {isPending && <li className="px-3 py-2 text-[13px] text-muted">파일 목록을 모으는 중…</li>}
          {error && <li className="px-3 py-2 text-[13px] text-accent">{error.message}</li>}
          {data && query.trim() && hits.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">맞는 파일이 없어요</li>}
          {hits.map((hit, index) => (
            <li key={hit.path} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(hit.path, true)}
                className={`flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] ${index === active ? "bg-tint-2" : ""}`}
              >
                <FileIcon name={baseName(hit.path)} />
                <HitLabel hit={hit} />
              </button>
            </li>
          ))}
          {data?.truncated && <li className="px-3 py-2 text-[12px] text-muted">파일이 너무 많아서 앞쪽 20만 개에서만 찾았어요.</li>}
        </ul>
      </div>
    </div>
  );
}
