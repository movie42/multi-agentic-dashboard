"use client";

import type { GraphCommit, GraphRef } from "@/common/gitGraph/types";
import type { Anchor, RowLayout } from "../model/layout";

export const ROW_HEIGHT = 28;
const LANE_WIDTH = 14;
const PAD = 9;

const LANE_STROKE = ["stroke-now", "stroke-pr", "stroke-done", "stroke-ask", "stroke-focus", "stroke-accent", "stroke-muted"] as const;
const LANE_FILL = ["fill-now", "fill-pr", "fill-done", "fill-ask", "fill-focus", "fill-accent", "fill-muted"] as const;

const strokeOf = (lane: number) => LANE_STROKE[lane % LANE_STROKE.length];
const fillOf = (lane: number) => LANE_FILL[lane % LANE_FILL.length];
const xOf = (lane: number) => PAD + lane * LANE_WIDTH;
const Y: Record<Anchor, number> = { top: 0, mid: ROW_HEIGHT / 2, bottom: ROW_HEIGHT };

export const graphWidth = (laneCount: number) => PAD * 2 + Math.max(0, laneCount - 1) * LANE_WIDTH;

function pathOf(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const bend = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${bend}, ${x2} ${bend}, ${x2} ${y2}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

export const formatCommitTime = (time: number) => DATE_FORMAT.format(new Date(time));

interface RefChipProps {
  decoration: GraphRef;
  elsewhere: string | null;
}

function RefChip({ decoration, elsewhere }: RefChipProps) {
  if (decoration.kind === "head") {
    return <span className="shrink-0 rounded-full bg-accent px-2 text-[11px] leading-5 font-semibold text-accent-ink">HEAD</span>;
  }
  if (decoration.kind === "tag") {
    return <span className="max-w-40 shrink-0 truncate rounded-full bg-pr/10 px-2 text-[11px] leading-5 text-pr">🏷 {decoration.name}</span>;
  }
  if (decoration.kind === "remote") {
    return (
      <span className="max-w-48 shrink-0 truncate rounded-full px-2 text-[11px] leading-5 text-muted shadow-[inset_0_0_0_1px_var(--hair)]">
        {decoration.name}
      </span>
    );
  }
  return (
    <span
      title={decoration.current ? "이 워크트리의 브랜치" : elsewhere ? `${elsewhere} 워크트리에서 쓰는 중` : "로컬 브랜치"}
      className={`max-w-48 shrink-0 truncate rounded-full px-2 text-[11px] leading-5 font-semibold ${
        decoration.current ? "bg-fg text-bg" : elsewhere ? "bg-tint-2 text-muted" : "bg-tint-2"
      }`}
    >
      {decoration.current && "● "}
      {decoration.name}
      {elsewhere && " ⎇"}
    </span>
  );
}

interface GraphRowProps {
  commit: GraphCommit;
  layout: RowLayout;
  width: number;
  isHead: boolean;
  selected: boolean;
  menuOpen: boolean;
  checkedOut: Record<string, string>;
  worktreePath: string;
  onSelect: () => void;
  onMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** Set on the virtual row above HEAD that stands for the uncommitted changes. */
  workingCount?: number;
  /** Worktrees whose checkout sits on this commit. */
  worktreesHere: { path: string; name: string; isBase: boolean }[];
  onPickWorktree: (worktreePath: string) => void;
}

export const WORKING_SHA = "working-tree";

export function GraphRow({
  commit,
  layout,
  width,
  isHead,
  selected,
  menuOpen,
  checkedOut,
  worktreePath,
  onSelect,
  onMenu,
  workingCount,
  worktreesHere,
  onPickWorktree,
}: GraphRowProps) {
  const working = workingCount !== undefined;
  const cx = xOf(layout.lane);
  const elsewhereOf = (decoration: GraphRef) => {
    const holder = decoration.kind === "branch" ? checkedOut[decoration.name] : undefined;
    return holder !== undefined && holder !== worktreePath ? holder : null;
  };
  return (
    <div
      role="row"
      aria-selected={selected}
      onClick={onSelect}
      onContextMenu={(event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        onMenu(event);
      }}
      className={`flex h-7 cursor-default items-center gap-3 pr-3 text-[13px] ${
        selected ? "bg-tint shadow-[inset_2px_0_0_var(--focus)]" : menuOpen ? "bg-tint" : "hover:bg-tint"
      }`}
    >
      <svg aria-hidden width={width} height={ROW_HEIGHT} className="shrink-0">
        {layout.segments.map((segment, index) => (
          <path
            key={index}
            d={pathOf(xOf(segment.fromLane), Y[segment.from], xOf(segment.toLane), Y[segment.to])}
            className={`fill-none ${strokeOf(segment.lane)}`}
            strokeWidth={2}
          />
        ))}
        {working ? (
          <circle cx={cx} cy={Y.mid} r={5} strokeWidth={2} strokeDasharray="2.5 2" className="fill-bg stroke-muted" />
        ) : isHead ? (
          <circle cx={cx} cy={Y.mid} r={5.5} strokeWidth={2.5} className={`fill-bg ${strokeOf(layout.lane)}`} />
        ) : (
          <circle cx={cx} cy={Y.mid} r={4} className={fillOf(layout.lane)} />
        )}
      </svg>
      {working ? (
        <span className="flex min-w-0 flex-1 items-center gap-2 text-muted">
          <span className="font-semibold text-ask">커밋 안 한 변경 {workingCount}개</span>
          <span className="truncate text-[12px]">눌러서 파일과 diff 보기</span>
        </span>
      ) : (
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {worktreesHere.map((worktree) => (
          <button
            key={worktree.path}
            type="button"
            title={worktree.isBase ? `기준 워크트리 · ${worktree.path}` : `${worktree.path}\n눌러서 기준 워크트리로`}
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              if (!worktree.isBase) onPickWorktree(worktree.path);
            }}
            className={`max-w-40 shrink-0 truncate rounded-md px-1.5 text-[11px] leading-5 font-semibold ${
              worktree.isBase ? "bg-focus text-bg" : "text-focus shadow-[inset_0_0_0_1px_var(--focus)] hover:bg-focus hover:text-bg"
            }`}
          >
            ⌂ {worktree.name}
          </button>
        ))}
        {commit.refs.map((decoration) => (
          <RefChip
            key={`${decoration.kind}:${decoration.name}`}
            decoration={decoration}
            elsewhere={elsewhereOf(decoration)}
          />
        ))}
        <span className={`truncate ${commit.parents.length > 1 ? "text-muted" : ""}`}>{commit.subject}</span>
      </span>
      )}
      <span className="w-28 shrink-0 truncate text-[12px] text-muted">{working ? "" : commit.author}</span>
      <span className="w-32 shrink-0 text-[12px] text-muted tabular-nums">{working ? "" : formatCommitTime(commit.time)}</span>
      <span className="w-16 shrink-0 font-mono text-[12px] text-muted">{working ? "" : commit.sha.slice(0, 7)}</span>
    </div>
  );
}
