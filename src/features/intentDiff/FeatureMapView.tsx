"use client";

import { useContext, useState } from "react";
import type { FeatureCluster, FeatureMap, FileOwner, OwnerKind } from "@/lib/intentDiff/types";
import { HunkBlock } from "./HunkBlock";
import { HunkLookup } from "./IntentGroupBlock";

const INDENT = ["pl-0", "pl-6", "pl-12", "pl-18", "pl-24", "pl-30", "pl-36", "pl-42", "pl-48"];

const OWNER_STYLE: Record<OwnerKind, string> = {
  item: "bg-tint text-fg",
  intent: "bg-tint text-fg",
  unplanned: "text-ask shadow-[inset_0_0_0_1px_var(--st-ask)]",
  mechanical: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
  unknown: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
};

interface TreeRow {
  file: string;
  depth: number;
  /** Imported files drawn on another row of this feature. */
  drawnElsewhere: string[];
}

interface EntryTree {
  entry: string;
  rows: TreeRow[];
}

/** Depth-first from each entry; a file is drawn once per feature, later references become a note. */
function entryTrees(cluster: FeatureCluster, map: FeatureMap): EntryTree[] {
  const drawn = new Set<string>();
  const trees: EntryTree[] = [];
  const visit = (rows: TreeRow[], file: string, depth: number) => {
    drawn.add(file);
    const row: TreeRow = { file, depth, drawnElsewhere: [] };
    rows.push(row);
    for (const child of map.files[file]?.imports ?? []) {
      if (drawn.has(child)) row.drawnElsewhere.push(child);
      else visit(rows, child, depth + 1);
    }
  };
  const starts = [...cluster.entries, ...cluster.files];
  for (const start of starts) {
    if (drawn.has(start)) continue;
    const rows: TreeRow[] = [];
    visit(rows, start, 0);
    trees.push({ entry: start, rows });
  }
  return trees;
}

function entryKind(file: string): string {
  if (/(^|\/)route\.[jt]sx?$/.test(file)) return "API";
  if (/(^|\/)page\.[jt]sx?$/.test(file)) return "화면";
  if (/\.tsx$/.test(file)) return "화면 조각";
  return "모듈";
}

function baseName(file: string): string {
  return file.split("/").pop() ?? file;
}

function dirName(file: string): string {
  const index = file.lastIndexOf("/");
  return index >= 0 ? file.slice(0, index + 1) : "";
}

interface OwnerChipProps {
  owner: FileOwner;
}

function OwnerChip({ owner }: OwnerChipProps) {
  const text = owner.kind === "item" ? owner.id : owner.label;
  return (
    <span title={owner.label} className={`max-w-[16rem] truncate rounded-full px-2 py-px text-[11px] ${OWNER_STYLE[owner.kind]}`}>
      {text}
    </span>
  );
}

interface FileRowProps {
  row: TreeRow;
  map: FeatureMap;
}

function FileRow({ row, map }: FileRowProps) {
  const [open, setOpen] = useState(false);
  const lookup = useContext(HunkLookup);
  const node = map.files[row.file];
  if (!node) return null;
  const sharedBy = node.importedBy.length;

  return (
    <li className={INDENT[Math.min(row.depth, INDENT.length - 1)]}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md px-2 py-1 text-left hover:bg-tint"
      >
        <span className="w-3 shrink-0 text-[11px] text-muted">{open ? "▾" : "▸"}</span>
        <span className="font-mono text-[13px]">
          <span className="text-muted">{dirName(row.file)}</span>
          <span className="font-semibold">{baseName(row.file)}</span>
        </span>
        <span className="font-mono text-[12px]">
          <span className="text-done">+{node.added}</span> <span className="text-accent">−{node.removed}</span>
        </span>
        {sharedBy > 1 && <span className="text-[11px] text-muted">쓰는 곳 {sharedBy}</span>}
        <span className="flex flex-wrap gap-1">
          {node.owners.map((owner) => (
            <OwnerChip key={`${owner.kind}:${owner.id}`} owner={owner} />
          ))}
        </span>
      </button>
      {row.drawnElsewhere.length > 0 && (
        <p className="pl-7 text-[11px] text-faint">가져옴 · 이 지도 다른 줄에 있음: {row.drawnElsewhere.map(baseName).join(", ")}</p>
      )}
      {open && (
        <div className="mt-2 mb-4 flex flex-col gap-3 pl-7">
          {node.hunkIds.map((hunkId) => {
            const entry = lookup.get(hunkId);
            const owner = node.owners.length > 1 ? undefined : node.owners[0]?.label;
            return entry ? <HunkBlock key={hunkId} file={entry.file} hunk={entry.hunk} precision={null} note={owner} /> : null;
          })}
        </div>
      )}
    </li>
  );
}

interface FeatureMapViewProps {
  map: FeatureMap;
}

export function FeatureMapView({ map }: FeatureMapViewProps) {
  return (
    <div className="flex flex-col gap-12">
      <p className="text-[13px] text-muted">
        바뀐 파일끼리 import로 이어진 묶음 하나가 기능 하나예요. 맨 위는 아무도 가져오지 않는 입구(화면 · API · 탭)이고, 아래로 내려갈수록 그 입구가 쓰는 파일이에요. 파일을 누르면 그 자리에서 변경을 읽어요.
      </p>
      {map.clusters.length === 0 && <p className="text-[14px] text-muted">import로 서로 이어진 변경 파일이 없어요.</p>}
      {map.clusters.map((cluster) => (
        <section key={cluster.id} id={cluster.id} className="flex scroll-mt-6 flex-col gap-5 border-t border-hair pt-5">
          <header>
            <h2 className="text-[20px] font-bold tracking-[-0.01em]">{cluster.title}</h2>
            <p className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted">
              <span>
                입구 {cluster.entries.length} · 파일 {cluster.files.length}
              </span>
              {cluster.phases.length > 0 && <span>걸친 Phase {cluster.phases.join(" · ")}</span>}
            </p>
          </header>
          {entryTrees(cluster, map).map((tree) => (
            <div key={tree.entry} className="flex flex-col gap-1">
              <p className="text-[12px] font-semibold text-muted">
                입구 · {entryKind(tree.entry)} <span className="font-mono font-normal">{baseName(tree.entry)}</span>
              </p>
              <ul className="flex flex-col">
                {tree.rows.map((row) => (
                  <FileRow key={row.file} row={row} map={map} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      {map.loose.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-hair pt-5">
          <header>
            <h2 className="text-[20px] font-bold tracking-[-0.01em]">import 연결이 없는 파일 {map.loose.length}</h2>
            <p className="mt-1 text-[12px] text-muted">설정, 스크립트, 문서처럼 다른 바뀐 파일과 import로 이어지지 않은 파일이에요.</p>
          </header>
          <ul className="flex flex-col">
            {map.loose.map((file) => (
              <FileRow key={file} row={{ file, depth: 0, drawnElsewhere: [] }} map={map} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
