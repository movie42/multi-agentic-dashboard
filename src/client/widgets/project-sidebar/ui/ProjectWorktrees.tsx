"use client";

import { useLayoutEffect, useRef } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import type { WorktreeSummary } from "@/common/board/types";
import { useWorktreeOrder } from "@/client/entities/workspace";

export interface WorktreeCounts {
  needsInput: number;
  needsMe: number;
  working: number;
}

const NO_COUNTS: WorktreeCounts = { needsInput: 0, needsMe: 0, working: 0 };

const INDENT = ["pl-6", "pl-10", "pl-14"] as const;
const indentOf = (depth: number) => INDENT[Math.min(depth, INDENT.length - 1)];

function dotClass({ needsInput, needsMe, working }: WorktreeCounts): string {
  if (needsInput > 0) return "animate-pulse bg-accent";
  if (needsMe > 0) return "bg-ask";
  if (working > 0) return "bg-now";
  return "shadow-[inset_0_0_0_1.5px_var(--faint)]";
}

interface Row {
  worktree: WorktreeSummary;
  depth: number;
  group: string;
}

function flatten(ordered: WorktreeSummary[]): Row[] {
  const ids = new Set(ordered.map((worktree) => worktree.worktreeId));
  const parentOf = (worktree: WorktreeSummary) =>
    worktree.parentWorktreeId !== null && ids.has(worktree.parentWorktreeId) ? worktree.parentWorktreeId : null;
  const walk = (parent: string | null, depth: number): Row[] =>
    ordered
      .filter((worktree) => parentOf(worktree) === parent)
      .flatMap((worktree) => [
        { worktree, depth, group: parent ?? "" },
        ...walk(worktree.worktreeId, depth + 1),
      ]);
  return walk(null, 0);
}

interface WorktreeRowProps {
  row: Row;
  counts: WorktreeCounts;
  selected: boolean;
  onSelect: () => void;
}

function WorktreeRow({ row, counts, selected, onSelect }: WorktreeRowProps) {
  const { worktree, depth } = row;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: worktree.worktreeId,
  });
  const itemRef = useRef<HTMLLIElement | null>(null);
  useLayoutEffect(() => {
    const item = itemRef.current;
    if (!item) return;
    item.style.transform = DndCSS.Translate.toString(transform) ?? "";
    item.style.transition = transition ?? "";
  }, [transform, transition]);

  return (
    <li
      ref={(element: HTMLLIElement | null) => {
        itemRef.current = element;
        setNodeRef(element);
      }}
      className={`relative ${isDragging ? "z-10 opacity-60" : ""}`}
    >
      <button
        type="button"
        data-sidebar-worktree={worktree.worktreeId}
        aria-current={selected ? "page" : undefined}
        title={`${worktree.name}${worktree.branch && worktree.branch !== worktree.name ? `\n${worktree.branch}` : ""}\n끌어서 순서를 바꿔요`}
        onClick={onSelect}
        {...attributes}
        {...listeners}
        className={`-mx-2 grid w-[calc(100%+1rem)] touch-none grid-cols-[8px_1fr_auto] items-center gap-x-2 rounded-md py-1 pr-2 text-left text-[13px] leading-[1.4] ${indentOf(
          depth,
        )} ${selected ? "bg-bg font-semibold" : "text-muted hover:bg-tint-2 hover:text-fg"}`}
      >
        <span className={`size-1.5 justify-self-center rounded-full ${dotClass(counts)}`} />
        <span className="truncate">{worktree.name}</span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold">
          {counts.needsInput > 0 && (
            <span title="입력이 필요한 세션" className="rounded-full bg-accent px-1.5 py-0.5 leading-none text-accent-ink">
              {counts.needsInput}
            </span>
          )}
          {counts.needsMe > 0 && <span className="text-ask">{counts.needsMe}</span>}
          {counts.working > 0 && <span className="text-now">{counts.working}</span>}
        </span>
      </button>
    </li>
  );
}

interface ProjectWorktreesProps {
  repo: string;
  worktrees: WorktreeSummary[];
  countsOf: (worktreeId: string) => WorktreeCounts | undefined;
  /** Whether this project is the one shown in the main area. */
  active: boolean;
  /** The stored selection; falls back to the first worktree like the main area does. */
  selectedId: string | null;
  onSelect: (worktreeId: string) => void;
}

export function ProjectWorktrees({ repo, worktrees, countsOf, active, selectedId, onSelect }: ProjectWorktreesProps) {
  const { ordered, move } = useWorktreeOrder(repo, worktrees);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const rows = flatten(ordered);
  const groupOf = new Map(rows.map((row) => [row.worktree.worktreeId, row.group]));
  const ids = rows.map((row) => row.worktree.worktreeId);
  const shownId = active ? (ids.find((id) => id === selectedId) ?? ordered[0]?.worktreeId ?? null) : null;
  const closestSibling: CollisionDetection = (args) =>
    closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => groupOf.get(String(container.id)) === groupOf.get(String(args.active.id)),
      ),
    });
  const drop = ({ active, over }: DragEndEvent) => {
    if (!over || over.id === active.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    move(String(active.id), String(over.id), from < to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestSibling} onDragEnd={drop}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={`${repo} 워크트리`} className="mb-1 flex flex-col gap-px">
          {rows.map((row) => (
            <WorktreeRow
              key={row.worktree.worktreeId}
              row={row}
              counts={countsOf(row.worktree.worktreeId) ?? NO_COUNTS}
              selected={row.worktree.worktreeId === shownId}
              onSelect={() => onSelect(row.worktree.worktreeId)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
