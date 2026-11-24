"use client";

import { useEffect, useRef, useState } from "react";
import { adopt, boundsOf, capPoints, centerOf, dragBox, moveItems, penPath, placed, resizeItem, simplify, unplaced } from "@/common/sketch/ops";
import { SKETCH_ITEM_LIMIT, SKETCH_POINT_LIMIT, SKETCH_TEXT_LIMIT } from "@/common/sketch/schema";
import { textSegments } from "@/common/sketch/links";
import { fillEditable, linkPastedSelection, readEditable } from "./linkEditing";
import { SKETCH_COLORS } from "@/common/sketch/schema";
import type { SketchColor, SketchItem, SketchPoint, SketchRect } from "@/common/sketch/types";
import type { Sketch } from "../model/useSketch";

/** The drawing tools; 편집 (select) also picks, moves and edits what was drawn. */
export type SketchTool = "note" | "text" | "rect" | "ellipse" | "arrow" | "pen";

export const SKETCH_TOOLS: ReadonlyArray<{ tool: SketchTool; label: string; key: string; code: string; hint: string; icon: React.ReactNode }> = [
  {
    tool: "note",
    label: "메모",
    key: "S",
    code: "KeyS",
    hint: "누른 자리에 포스트잇을 붙여요",
    icon: <path d="M3 3h10v6.5L9.5 13H3z M9.5 13V9.5H13" />,
  },
  { tool: "text", label: "글", key: "T", code: "KeyT", hint: "누른 자리에 글을 써요", icon: <path d="M3.5 4V3h9v1 M8 3v10 M6 13h4" /> },
  { tool: "rect", label: "사각형", key: "B", code: "KeyB", hint: "끌어서 사각형을 그려요", icon: <rect x={3} y={4} width={10} height={8} rx={1} /> },
  { tool: "ellipse", label: "원", key: "O", code: "KeyO", hint: "끌어서 원을 그려요", icon: <ellipse cx={8} cy={8} rx={5.5} ry={4.5} /> },
  { tool: "arrow", label: "화살표", key: "A", code: "KeyA", hint: "끌어서 화살표를 그려요", icon: <path d="M3 13L13 3 M7.5 3H13v5.5" /> },
  { tool: "pen", label: "펜", key: "P", code: "KeyP", hint: "끌어서 손으로 그려요", icon: <path d="M3 13c1.5-3 3-4.5 4.5-3s2 1 3.5-1.5S12.5 4 13 3" /> },
];

export const isSketchTool = (tool: string): tool is SketchTool => SKETCH_TOOLS.some((entry) => entry.tool === tool);

const COLOR_NAME: Record<SketchColor, string> = {
  ink: "검정",
  yellow: "노랑",
  orange: "주황",
  red: "빨강",
  green: "초록",
  teal: "청록",
  blue: "파랑",
  violet: "보라",
  gray: "회색",
};
const STROKE: Record<SketchColor, string> = {
  ink: "stroke-fg",
  yellow: "stroke-swatch-yellow",
  orange: "stroke-swatch-orange",
  red: "stroke-swatch-red",
  green: "stroke-swatch-green",
  teal: "stroke-swatch-teal",
  blue: "stroke-swatch-blue",
  violet: "stroke-swatch-violet",
  gray: "stroke-swatch-gray",
};
const FILL: Record<SketchColor, string> = {
  ink: "fill-fg",
  yellow: "fill-swatch-yellow",
  orange: "fill-swatch-orange",
  red: "fill-swatch-red",
  green: "fill-swatch-green",
  teal: "fill-swatch-teal",
  blue: "fill-swatch-blue",
  violet: "fill-swatch-violet",
  gray: "fill-swatch-gray",
};
const NOTE_FILL: Record<SketchColor, string> = {
  ink: "fill-tint-2",
  yellow: "fill-swatch-yellow/25",
  orange: "fill-swatch-orange/25",
  red: "fill-swatch-red/25",
  green: "fill-swatch-green/25",
  teal: "fill-swatch-teal/25",
  blue: "fill-swatch-blue/25",
  violet: "fill-swatch-violet/25",
  gray: "fill-swatch-gray/25",
};
const INK: Record<SketchColor, string> = {
  ink: "text-fg",
  yellow: "text-swatch-yellow",
  orange: "text-swatch-orange",
  red: "text-swatch-red",
  green: "text-swatch-green",
  teal: "text-swatch-teal",
  blue: "text-swatch-blue",
  violet: "text-swatch-violet",
  gray: "text-swatch-gray",
};
const SWATCH: Record<SketchColor, string> = {
  ink: "bg-fg",
  yellow: "bg-swatch-yellow",
  orange: "bg-swatch-orange",
  red: "bg-swatch-red",
  green: "bg-swatch-green",
  teal: "bg-swatch-teal",
  blue: "bg-swatch-blue",
  violet: "bg-swatch-violet",
  gray: "bg-swatch-gray",
};

const DEFAULT_SIZE: Record<"note" | "text" | "rect" | "ellipse", { w: number; h: number }> = {
  note: { w: 200, h: 160 },
  text: { w: 240, h: 40 },
  rect: { w: 160, h: 100 },
  ellipse: { w: 160, h: 100 },
};
const DRAG_THRESHOLD = 3;
const STROKE_WIDTH = 2.5;
const PALETTE_H = 34;

type PenPoint = [number, number];

type Gesture =
  | { kind: "draw"; tool: SketchTool; start: SketchPoint; end: SketchPoint; points: PenPoint[]; moved: boolean }
  | { kind: "move"; ids: Set<string>; start: SketchPoint; by: SketchPoint; moved: boolean }
  /** `offset` is from the pointer to the real corner, so the corner does not jump to where it was grabbed. */
  | { kind: "resize"; id: string; corner: SketchPoint; offset: SketchPoint };

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function capture(element: Element, pointerId: number) {
  if (typeof element.setPointerCapture === "function") element.setPointerCapture(pointerId);
}

/** What the drawing tool makes from a press at `start` released at `end`; a click without a drag gets a default size. */
function drawn(gesture: Extract<Gesture, { kind: "draw" }>, id: string): SketchItem {
  const { tool, start, end, moved } = gesture;
  if (tool === "pen") return { kind: "pen", id, color: "ink", points: gesture.points };
  if (tool === "arrow") {
    const to = moved ? end : { x: start.x + 120, y: start.y };
    return { kind: "arrow", id, color: "ink", x1: start.x, y1: start.y, x2: to.x, y2: to.y };
  }
  const box = moved ? dragBox(start, end) : { ...start, ...DEFAULT_SIZE[tool] };
  const size = { w: Math.max(box.w, 16), h: Math.max(box.h, 16) };
  if (tool === "note") return { kind: "note", id, color: "yellow", text: "", x: box.x, y: box.y, ...size };
  if (tool === "text") return { kind: "text", id, color: "ink", text: "", x: box.x, y: box.y, ...size };
  return { kind: tool, id, color: "ink", x: box.x, y: box.y, ...size };
}

interface SketchToolsOptions {
  sketch: Sketch;
  tool: SketchTool | "select" | "hand";
  zoom: number;
  /** True while the canvas is being panned (space held): presses go to the canvas. */
  passive: boolean;
  toWorld: (clientX: number, clientY: number) => SketchPoint;
  /** A shape was placed; the canvas goes back to the pointer like FigJam. */
  onDone: () => void;
  /** The worktree and project frames an item can sit in; without them every item is free. */
  frames?: SketchFrames;
  newId?: () => string;
}

export interface SketchFrames {
  /** Each frame's top-left corner as shown now, by frame id. */
  origins: ReadonlyMap<string, SketchPoint>;
  /** The innermost frame under a point. */
  frameAt: (point: SketchPoint) => string | undefined;
}

const NO_FRAMES: SketchFrames = { origins: new Map(), frameAt: () => undefined };

export type SketchUi = ReturnType<typeof useSketchTools>;

/**
 * Memos and drawings on the canvas, FigJam style. An item dropped with its center inside a worktree
 * (or project) frame belongs to it and moves when the frame moves; dropped outside, it is free.
 * Presses on items are kept from the canvas, so a memo drags without moving the view.
 */
export function useSketchTools({ sketch, tool, zoom, passive, toWorld, onDone, frames = NO_FRAMES, newId = () => crypto.randomUUID() }: SketchToolsOptions) {
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<Gesture | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const items = sketch.items.map((item) => placed(item, frames.origins));
  /** Edits shown items; the `moved` ones join the frame they now sit in, the rest keep theirs. */
  const edit = (change: (current: SketchItem[]) => SketchItem[], moved: ReadonlySet<string> = new Set()) =>
    sketch.change((stored) => {
      const before = new Map(stored.map((item) => [item.id, item]));
      const shownNow = stored.map((item) => placed(item, frames.origins));
      const next = change(shownNow);
      if (next === shownNow) return stored;
      return next.map((item) => {
        if (moved.has(item.id)) return adopt(item, frames.frameAt(centerOf(item)), frames.origins);
        const parent = before.get(item.id)?.parent;
        return parent ? unplaced(item, parent, frames.origins) : item;
      });
    });
  const live = new Set(items.map((item) => item.id));
  const picked = new Set([...selected].filter((id) => live.has(id)));

  const update = (next: Gesture) => {
    gesture.current = next;
    setPreview({ ...next });
  };
  const finish = () => {
    gesture.current = null;
    setPreview(null);
  };

  const shown: SketchItem[] = (() => {
    if (preview?.kind === "move" && preview.moved) return moveItems(items, preview.ids, preview.by);
    if (preview?.kind === "resize") return items.map((item) => (item.id === preview.id ? resizeItem(item, preview.corner) : item));
    if (preview?.kind === "draw" && (preview.moved || preview.tool === "pen")) return [...items, drawn(preview, "draft")];
    return items;
  })();

  const remove = (ids: ReadonlySet<string>) => {
    if (ids.size === 0) return;
    edit((current) => current.filter((item) => !ids.has(item.id)));
    setSelected(new Set());
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (event.target instanceof Element && event.target.closest("aside")) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) sketch.redo();
        else sketch.undo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && picked.size > 0) {
        event.preventDefault();
        remove(picked);
      } else if (event.key === "Escape") {
        setSelected(new Set());
      }
    };
    const onDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-sketch], [data-sketch-ui]")) return;
      setSelected((current) => (current.size === 0 ? current : new Set()));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  });

  const onCaptureDown = (event: React.PointerEvent<SVGElement>) => {
    if (passive || event.button !== 0 || tool === "select" || tool === "hand") return;
    event.stopPropagation();
    capture(event.currentTarget, event.pointerId);
    const start = toWorld(event.clientX, event.clientY);
    setEditingId(null);
    update({ kind: "draw", tool, start, end: start, points: [[start.x, start.y]], moved: false });
  };

  const onItemDown = (id: string, event: React.PointerEvent<SVGElement>) => {
    if (passive || event.button !== 0 || tool !== "select") return;
    event.stopPropagation();
    if (editingId === id) return;
    setEditingId(null);
    const next = event.shiftKey
      ? new Set(picked.has(id) ? [...picked].filter((other) => other !== id) : [...picked, id])
      : picked.has(id)
        ? picked
        : new Set([id]);
    setSelected(next);
    if (!next.has(id)) return;
    capture(event.currentTarget, event.pointerId);
    update({ kind: "move", ids: new Set(next), start: toWorld(event.clientX, event.clientY), by: { x: 0, y: 0 }, moved: false });
  };

  const onResizeDown = (id: string, event: React.PointerEvent<SVGElement>) => {
    if (passive || event.button !== 0) return;
    event.stopPropagation();
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    capture(event.currentTarget, event.pointerId);
    const at = toWorld(event.clientX, event.clientY);
    const box = boundsOf(item);
    const offset = { x: box.x + box.w - at.x, y: box.y + box.h - at.y };
    update({ kind: "resize", id, corner: { x: at.x + offset.x, y: at.y + offset.y }, offset });
  };

  const onMove = (event: React.PointerEvent<SVGElement>) => {
    const current = gesture.current;
    if (!current) return;
    event.stopPropagation();
    const at = toWorld(event.clientX, event.clientY);
    if (current.kind === "draw") {
      const moved = current.moved || Math.hypot(at.x - current.start.x, at.y - current.start.y) * zoom > DRAG_THRESHOLD;
      update({ ...current, end: at, moved, points: current.tool === "pen" ? [...current.points, [at.x, at.y]] : current.points });
    } else if (current.kind === "move") {
      const by = { x: at.x - current.start.x, y: at.y - current.start.y };
      update({ ...current, by, moved: current.moved || Math.hypot(by.x, by.y) * zoom > DRAG_THRESHOLD });
    } else {
      update({ ...current, corner: { x: at.x + current.offset.x, y: at.y + current.offset.y } });
    }
  };

  const onUp = (event: React.PointerEvent<SVGElement>) => {
    const current = gesture.current;
    if (!current) return;
    event.stopPropagation();
    finish();
    const at = toWorld(event.clientX, event.clientY);
    if (current.kind === "draw") {
      if (shown.length >= SKETCH_ITEM_LIMIT) {
        console.warn("[sketch] board is full", SKETCH_ITEM_LIMIT);
        return;
      }
      const points: PenPoint[] = [...current.points, [at.x, at.y]];
      const item = drawn({ ...current, end: at, points: capPoints(simplify(points, 1.5 / zoom), SKETCH_POINT_LIMIT) }, newId());
      edit((current) => [...current, item], new Set([item.id]));
      if (item.kind === "note" || item.kind === "text") setEditingId(item.id);
      else setSelected(new Set([item.id]));
      if (current.tool !== "pen") onDone();
    } else if (current.kind === "move") {
      if (current.moved) edit((all) => moveItems(all, current.ids, current.by), current.ids);
    } else {
      const corner = { x: at.x + current.offset.x, y: at.y + current.offset.y };
      edit((all) => all.map((item) => (item.id === current.id ? resizeItem(item, corner) : item)), new Set([current.id]));
    }
  };

  const recolor = (color: SketchColor) => edit((current) => current.map((item) => (picked.has(item.id) ? { ...item, color } : item)));

  const commitText = (id: string, typed: string) => {
    setEditingId(null);
    const text = typed.slice(0, SKETCH_TEXT_LIMIT);
    edit((current) => {
      const item = current.find((entry) => entry.id === id);
      if (!item || (item.kind !== "note" && item.kind !== "text")) return current;
      if (item.kind === "text" && text.trim() === "") return current.filter((entry) => entry.id !== id);
      return item.text === text ? current : current.map((entry) => (entry.id === id ? { ...item, text } : entry));
    });
  };

  return {
    items: shown,
    zoom,
    selected: picked,
    editingId,
    dragging: preview !== null,
    resizing: preview?.kind === "resize",
    onCaptureDown,
    onItemDown,
    onResizeDown,
    onMove,
    onUp,
    onEdit: (id: string) => {
      if (tool === "select") setEditingId(id);
    },
    commitText,
    recolor,
    remove: () => remove(picked),
  };
}

function Arrow({ item }: { item: Extract<SketchItem, { kind: "arrow" }> }) {
  const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
  const head = 12;
  const wing = (offset: number) => `${item.x2 - head * Math.cos(angle + offset)} ${item.y2 - head * Math.sin(angle + offset)}`;
  return (
    <>
      <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} strokeWidth={14} className="stroke-transparent" />
      <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} strokeWidth={STROKE_WIDTH} strokeLinecap="round" className={STROKE[item.color]} />
      <path d={`M ${item.x2} ${item.y2} L ${wing(0.45)} L ${wing(-0.45)} Z`} className={FILL[item.color]} />
    </>
  );
}

interface TextBodyProps {
  item: Extract<SketchItem, { kind: "note" | "text" }>;
  editing: boolean;
  onCommit: (text: string) => void;
}

interface TextEditorProps {
  item: TextBodyProps["item"];
  pad: string;
  tone: string;
  onCommit: (text: string) => void;
}

/** Edits the memo with its links shown by name, like the read view; the stored text keeps `[name](url)`. */
function TextEditor({ item, pad, tone, onCommit }: TextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    fillEditable(box, item.text);
    box.focus();
    const selection = box.ownerDocument.getSelection();
    selection?.selectAllChildren(box);
    selection?.collapseToEnd();
    // Fill once when editing opens; later renders must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline
      aria-label={item.kind === "note" ? "메모 내용" : "글 내용"}
      tabIndex={0}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-placeholder={item.kind === "note" ? "메모" : "글"}
      data-scroll-overflow
      onBlur={(event) => onCommit(readEditable(event.currentTarget))}
      onKeyDown={(event) => {
        if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) event.currentTarget.blur();
      }}
      onPaste={(event) => {
        if (linkPastedSelection(event.currentTarget, event.clipboardData.getData("text/plain"))) event.preventDefault();
      }}
      className={`h-full w-full overflow-y-auto break-words whitespace-pre-wrap outline-none empty:before:text-muted empty:before:content-[attr(data-placeholder)] [&_a]:text-focus [&_a]:underline [&_a]:underline-offset-2 ${pad} ${tone}`}
    />
  );
}

function TextBody({ item, editing, onCommit }: TextBodyProps) {
  const pad = item.kind === "note" ? "p-3" : "p-1";
  const tone = item.kind === "note" ? "text-fg text-[14px] leading-snug" : `${INK[item.color]} text-[18px] leading-snug font-semibold`;
  return (
    <foreignObject x={item.x} y={item.y} width={item.w} height={item.h} className={item.kind === "text" ? "overflow-visible" : undefined}>
      {editing ? (
        <TextEditor item={item} pad={pad} tone={tone} onCommit={onCommit} />
      ) : (
        <div data-scroll-overflow className={`h-full w-full overflow-y-auto break-words whitespace-pre-wrap ${pad} ${tone}`}>
          {item.text ? (
            textSegments(item.text).map((segment, index) =>
              segment.url ? (
                <a
                  // Segments of one text never reorder, so the index is a stable key here.
                  key={index}
                  href={segment.url}
                  target="_blank"
                  rel="noreferrer"
                  title={segment.url}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="pointer-events-auto text-focus underline underline-offset-2"
                >
                  {segment.text}
                </a>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )
          ) : (
            <span className="text-muted">{item.kind === "note" ? "메모" : ""}</span>
          )}
        </div>
      )}
    </foreignObject>
  );
}

function ItemShape({ item, ui }: { item: SketchItem; ui: SketchUi }) {
  switch (item.kind) {
    case "note":
      return (
        <>
          <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={6} strokeWidth={1} className={`${NOTE_FILL[item.color]} ${STROKE[item.color]} stroke-opacity-60`} />
          <TextBody item={item} editing={ui.editingId === item.id} onCommit={(text) => ui.commitText(item.id, text)} />
        </>
      );
    case "text":
      return (
        <>
          <rect x={item.x} y={item.y} width={item.w} height={item.h} className="fill-transparent" />
          <TextBody item={item} editing={ui.editingId === item.id} onCommit={(text) => ui.commitText(item.id, text)} />
        </>
      );
    case "rect":
      return <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={4} strokeWidth={STROKE_WIDTH} className={`fill-transparent ${STROKE[item.color]}`} />;
    case "ellipse":
      return (
        <ellipse cx={item.x + item.w / 2} cy={item.y + item.h / 2} rx={item.w / 2} ry={item.h / 2} strokeWidth={STROKE_WIDTH} className={`fill-transparent ${STROKE[item.color]}`} />
      );
    case "arrow":
      return <Arrow item={item} />;
    case "pen":
      return (
        <>
          <path d={penPath(item.points)} strokeWidth={14} className="fill-none stroke-transparent" />
          <path d={penPath(item.points)} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" className={`fill-none ${STROKE[item.color]}`} />
        </>
      );
  }
}

function union(rects: SketchRect[]): SketchRect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return { x, y, w: Math.max(...rects.map((rect) => rect.x + rect.w)) - x, h: Math.max(...rects.map((rect) => rect.y + rect.h)) - y };
}

/** The drawn items, under the session boxes, with the selection outline and its color bar. */
export function SketchItems({ ui }: { ui: SketchUi }) {
  const pickedItems = ui.items.filter((item) => ui.selected.has(item.id));
  const frame = union(pickedItems.map(boundsOf));
  const pad = 4 / ui.zoom;
  const single = pickedItems.length === 1 ? pickedItems[0] : null;
  return (
    <g onPointerMove={ui.onMove} onPointerUp={ui.onUp} onPointerCancel={ui.onUp}>
      {ui.items.map((item) => (
        <g
          key={item.id}
          data-sketch={item.id}
          onPointerDown={(event) => ui.onItemDown(item.id, event)}
          onDoubleClick={() => (item.kind === "note" || item.kind === "text") && ui.onEdit(item.id)}
        >
          <ItemShape item={item} ui={ui} />
        </g>
      ))}
      {frame && (
        <rect
          x={frame.x - pad}
          y={frame.y - pad}
          width={frame.w + pad * 2}
          height={frame.h + pad * 2}
          strokeWidth={1.5 / ui.zoom}
          strokeDasharray={`${4 / ui.zoom} ${3 / ui.zoom}`}
          className="pointer-events-none fill-none stroke-focus"
        />
      )}
      {single && single.kind !== "arrow" && single.kind !== "pen" && (!ui.dragging || ui.resizing) && (
        <rect
          data-sketch-ui
          aria-label="크기 조절"
          x={single.x + single.w - 5 / ui.zoom}
          y={single.y + single.h - 5 / ui.zoom}
          width={10 / ui.zoom}
          height={10 / ui.zoom}
          strokeWidth={1.5 / ui.zoom}
          onPointerDown={(event) => ui.onResizeDown(single.id, event)}
          className="cursor-nwse-resize fill-bg stroke-focus"
        />
      )}
      {frame && !ui.dragging && ui.editingId === null && (
        <g data-sketch-ui transform={`translate(${frame.x - pad} ${frame.y - pad - (PALETTE_H + 8) / ui.zoom}) scale(${1 / ui.zoom})`}>
          <foreignObject width={360} height={PALETTE_H} className="overflow-visible">
            <div role="toolbar" aria-label="그림 색" className="inline-flex items-center gap-1 rounded-[8px] bg-bg px-1.5 py-1 shadow-[0_6px_18px_-8px_var(--faint),inset_0_0_0_1px_var(--hair)]">
              {SKETCH_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={COLOR_NAME[color]}
                  aria-pressed={pickedItems.every((item) => item.color === color)}
                  onClick={() => ui.recolor(color)}
                  className={`h-5 w-5 rounded-full ${SWATCH[color]} aria-pressed:ring-2 aria-pressed:ring-focus aria-pressed:ring-offset-1 aria-pressed:ring-offset-bg`}
                />
              ))}
              <button type="button" onClick={ui.remove} title="지우기 (Delete)" className="ml-1 rounded-[6px] px-1.5 py-0.5 text-[12px] font-semibold text-muted hover:bg-tint">
                지우기
              </button>
            </div>
          </foreignObject>
        </g>
      )}
    </g>
  );
}

/** Over everything while a drawing tool is on, so a press anywhere — a session box too — starts drawing. */
export function SketchCapture({ ui }: { ui: SketchUi }) {
  return (
    <rect
      data-sketch-capture
      x={-1e6}
      y={-1e6}
      width={2e6}
      height={2e6}
      className="cursor-crosshair fill-transparent"
      onPointerDown={ui.onCaptureDown}
      onPointerMove={ui.onMove}
      onPointerUp={ui.onUp}
      onPointerCancel={ui.onUp}
    />
  );
}
