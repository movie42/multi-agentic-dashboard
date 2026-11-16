"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { AgentCard } from "@/common/board/types";
import type { DirEntry } from "@/common/files/types";
import { dirListQueryOptions, fileSearchQueryOptions } from "@/client/entities/files";
import { rankFiles, useFileExplorerStore, type FuzzyHit } from "@/client/features/browse-files";
import { useDocViewerStore } from "@/client/features/view-doc";
import type { MenuPoint } from "@/client/shared/ui/ContextMenu";
import { baseName, parentOf } from "../../lib/paths";
import { FileContextMenu } from "./FileContextMenu";
import { FileIcon, FolderIcon } from "./FileIcon";

const NO_DIRS: readonly string[] = [];
const RESULT_LIMIT = 200;

interface FileTreeProps {
  root: string;
  /** The file shown in the active tab; highlighted and revealed in the tree. */
  activeFile: string | null;
  agents: readonly AgentCard[];
}

interface MenuTarget {
  at: MenuPoint;
  path: string;
  isDir: boolean;
}

const ROW =
  "flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-[3px] text-left text-[13px] outline-none hover:bg-tint focus-visible:ring-1 focus-visible:ring-now";

function rowsIn(container: HTMLElement | null): HTMLElement[] {
  return container ? Array.from(container.querySelectorAll<HTMLElement>("[data-tree-row]")) : [];
}

export function FileTree({ root, activeFile, agents }: FileTreeProps) {
  const expanded = useFileExplorerStore((state) => state.expanded[root] ?? NO_DIRS);
  const { toggleDir, setExpanded, reveal } = useFileExplorerStore();
  const openFile = useDocViewerStore((state) => state.openFile);
  const [query, setQuery] = useState("");
  const [searchAll, setSearchAll] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeFile || !activeFile.startsWith(root + "/")) return;
    reveal(activeFile);
    const frame = requestAnimationFrame(() =>
      listRef.current?.querySelector(`[data-path="${CSS.escape(activeFile)}"]`)?.scrollIntoView({ block: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [activeFile, root, reveal]);

  const openMenu = (event: React.MouseEvent<HTMLElement>, path: string, isDir: boolean) => {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, path, isDir });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const rows = rowsIn(listRef.current);
    const current = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-tree-row]") : null;
    const index = current ? rows.indexOf(current) : -1;
    if (index === -1) return;
    const path = current?.dataset.path ?? "";
    const isDir = current?.dataset.kind === "dir";
    const isOpen = expanded.includes(path);
    const focusAt = (next: number) => rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
    if (event.key === "ArrowDown") focusAt(index + 1);
    else if (event.key === "ArrowUp") focusAt(index - 1);
    else if (event.key === "ArrowRight" && isDir) {
      if (isOpen) focusAt(index + 1);
      else setExpanded(path, true);
    } else if (event.key === "ArrowLeft") {
      if (isDir && isOpen) setExpanded(path, false);
      else rows.find((row) => row.dataset.path === parentOf(path))?.focus();
    } else if (event.key === "Enter" && !isDir && !query) {
      openFile(path, { preview: false });
    } else return;
    event.preventDefault();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-1.5 border-b border-hair px-2 py-2">
        <p className="truncate px-1 text-[11px] font-semibold tracking-wide text-muted uppercase" title={root}>
          {baseName(root)}
        </p>
        <input
          value={query}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              rowsIn(listRef.current)[0]?.focus();
            }
            if (event.key === "Escape" && query) {
              event.stopPropagation();
              setQuery("");
            }
          }}
          placeholder="파일 이름으로 찾기 (⌘P)"
          aria-label="파일 이름으로 찾기"
          className="w-full rounded-md bg-tint px-2 py-1 text-[13px] outline-none placeholder:text-muted focus:ring-1 focus:ring-now"
        />
        <label className="flex items-center gap-1.5 px-1 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={searchAll}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearchAll(event.target.checked)}
          />
          전부 검색 (node_modules · .git 포함)
        </label>
      </div>
      <div ref={listRef} role="tree" aria-label="파일" onKeyDown={onKeyDown} className="min-h-0 flex-1 overflow-auto px-1.5 py-1.5">
        {query.trim() ? (
          <SearchResults
            root={root}
            query={query}
            all={searchAll}
            activeFile={activeFile}
            onOpen={(path, preview) => openFile(path, { preview })}
            onMenu={openMenu}
          />
        ) : (
          <DirChildren
            dir={root}
            expanded={expanded}
            activeFile={activeFile}
            onToggle={toggleDir}
            onOpen={(path, preview) => openFile(path, { preview })}
            onMenu={openMenu}
          />
        )}
      </div>
      {menu && (
        <FileContextMenu at={menu.at} path={menu.path} isDir={menu.isDir} root={root} agents={agents} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

interface DirChildrenProps {
  dir: string;
  expanded: readonly string[];
  activeFile: string | null;
  onToggle: (dir: string) => void;
  onOpen: (path: string, preview: boolean) => void;
  onMenu: (event: React.MouseEvent<HTMLElement>, path: string, isDir: boolean) => void;
}

function DirChildren({ dir, expanded, activeFile, onToggle, onOpen, onMenu }: DirChildrenProps) {
  const { data, error, isPending } = useQuery(dirListQueryOptions(dir));
  if (isPending) return <p className="px-2 py-1 text-[12px] text-muted">불러오는 중…</p>;
  if (error) return <p className="px-2 py-1 text-[12px] text-accent">{error.message}</p>;
  if (data.entries.length === 0) return <p className="px-2 py-1 text-[12px] text-muted">비어 있어요</p>;
  return (
    <ul role="group" className="flex flex-col">
      {data.entries.map((entry) => (
        <TreeItem
          key={entry.path}
          entry={entry}
          expanded={expanded}
          activeFile={activeFile}
          onToggle={onToggle}
          onOpen={onOpen}
          onMenu={onMenu}
        />
      ))}
    </ul>
  );
}

interface TreeItemProps extends Omit<DirChildrenProps, "dir"> {
  entry: DirEntry;
}

function TreeItem({ entry, expanded, activeFile, onToggle, onOpen, onMenu }: TreeItemProps) {
  const isDir = entry.kind === "dir";
  const isOpen = isDir && expanded.includes(entry.path);
  const isActive = entry.path === activeFile;
  return (
    <li role="none">
      <button
        type="button"
        role="treeitem"
        aria-expanded={isDir ? isOpen : undefined}
        aria-selected={isActive}
        data-tree-row
        data-path={entry.path}
        data-kind={isDir ? "dir" : "file"}
        title={entry.path}
        onClick={() => (isDir ? onToggle(entry.path) : onOpen(entry.path, true))}
        onDoubleClick={() => !isDir && onOpen(entry.path, false)}
        onContextMenu={(event: React.MouseEvent<HTMLButtonElement>) => onMenu(event, entry.path, isDir)}
        className={`${ROW} ${isActive ? "bg-tint-2 font-semibold" : ""}`}
      >
        <span aria-hidden className={`w-3 shrink-0 text-[10px] text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>
          {isDir ? "▸" : ""}
        </span>
        {isDir ? <FolderIcon open={isOpen} /> : <FileIcon name={entry.name} />}
        <span className={`truncate ${entry.kind === "symlink" ? "italic" : ""}`}>{entry.name}</span>
      </button>
      {isOpen && (
        <div className="ml-[13px] border-l border-hair pl-1">
          <DirChildren
            dir={entry.path}
            expanded={expanded}
            activeFile={activeFile}
            onToggle={onToggle}
            onOpen={onOpen}
            onMenu={onMenu}
          />
        </div>
      )}
    </li>
  );
}

interface SearchResultsProps {
  root: string;
  query: string;
  all: boolean;
  activeFile: string | null;
  onOpen: (path: string, preview: boolean) => void;
  onMenu: (event: React.MouseEvent<HTMLElement>, path: string, isDir: boolean) => void;
}

function SearchResults({ root, query, all, activeFile, onOpen, onMenu }: SearchResultsProps) {
  const { data, error, isPending } = useQuery(fileSearchQueryOptions(root, all));
  if (isPending) return <p className="px-2 py-1 text-[12px] text-muted">파일 목록을 모으는 중…</p>;
  if (error) return <p className="px-2 py-1 text-[12px] text-accent">{error.message}</p>;
  const hits = rankFiles(query, data.files, RESULT_LIMIT);
  if (hits.length === 0) return <p className="px-2 py-1 text-[12px] text-muted">맞는 파일이 없어요</p>;
  return (
    <ul className="flex flex-col">
      {hits.map((hit) => {
        const path = `${root}/${hit.path}`;
        return (
          <li key={hit.path}>
            <button
              type="button"
              data-tree-row
              data-path={path}
              data-kind="file"
              title={path}
              onClick={() => onOpen(path, true)}
              onDoubleClick={() => onOpen(path, false)}
              onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onOpen(path, false);
              }}
              onContextMenu={(event: React.MouseEvent<HTMLButtonElement>) => onMenu(event, path, false)}
              className={`${ROW} ${path === activeFile ? "bg-tint-2" : ""}`}
            >
              <FileIcon name={baseName(hit.path)} />
              <HitLabel hit={hit} />
            </button>
          </li>
        );
      })}
      {data.truncated && <li className="px-2 py-1 text-[12px] text-muted">파일이 너무 많아서 앞쪽 20만 개에서만 찾았어요.</li>}
    </ul>
  );
}

interface HitLabelProps {
  hit: FuzzyHit;
}

export function HitLabel({ hit }: HitLabelProps) {
  const nameStart = hit.path.lastIndexOf("/") + 1;
  const marked = new Set(hit.indices);
  const piece = (from: number, to: number) =>
    Array.from(hit.path.slice(from, to), (char, offset) =>
      marked.has(from + offset) ? (
        <b key={from + offset} className="font-bold text-fg">
          {char}
        </b>
      ) : (
        char
      ),
    );
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0">{piece(nameStart, hit.path.length)}</span>
      {nameStart > 0 && <span className="truncate text-[12px] text-muted">{piece(0, nameStart - 1)}</span>}
    </span>
  );
}
