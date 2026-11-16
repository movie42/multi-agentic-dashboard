"use client";

import type { EdgeKind, GraphEdge } from "../model/graph";
import { edgeGeometry, type EdgeEnds, type Point, type Rect } from "../model/layout";

export const EDGE_STYLE: Record<EdgeKind, { label: string; stroke: string; dash?: string; marker: boolean; pill: string }> = {
  delegate: { label: "맡김", stroke: "stroke-fg", marker: true, pill: "text-fg" },
  report: { label: "보고", stroke: "stroke-now", dash: "6 5", marker: true, pill: "text-now" },
  next: { label: "끝나면", stroke: "stroke-muted", marker: true, pill: "text-muted" },
  fork: { label: "갈라짐", stroke: "stroke-faint", dash: "2 5", marker: false, pill: "text-muted" },
  overlap: { label: "같은 파일", stroke: "stroke-ask", dash: "6 5", marker: false, pill: "text-ask" },
};

const MARKER_KINDS = ["delegate", "report", "next", "paused"] as const;
const MARKER_FILL: Record<(typeof MARKER_KINDS)[number], string> = {
  delegate: "fill-fg",
  report: "fill-now",
  next: "fill-muted",
  paused: "fill-accent",
};

export function EdgeMarkers() {
  return (
    <defs>
      {MARKER_KINDS.map((kind) => (
        <marker key={kind} id={`edge-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className={MARKER_FILL[kind]} />
        </marker>
      ))}
    </defs>
  );
}

function edgeLabel(edge: GraphEdge): string {
  if (edge.paused) return `${EDGE_STYLE[edge.kind].label} · 멈춤`;
  if (edge.kind === "overlap") return `같은 파일 ${edge.files.length}`;
  return EDGE_STYLE[edge.kind].label;
}

interface GraphEdgesProps {
  edges: GraphEdge[];
  rectOf: (id: string) => Rect | null;
  /** Sides a person pinned, by link id. */
  ends: Record<string, EdgeEnds>;
  /** The line end being dragged, drawn to the pointer until it lands. */
  endDrag: { edgeId: string; end: "from" | "to"; point: Point } | null;
  selectedId: string | null;
  /** Clusters of the selected boxes; same-file lines touching them are drawn in full, the rest faint and unlabeled. */
  focusClusters: ReadonlySet<string>;
  onSelect: (edge: GraphEdge) => void;
}

/** Lines first, then their labels, so a label is never covered by another line. */
export function GraphEdges({ edges, rectOf, ends, endDrag, selectedId, focusClusters, onSelect }: GraphEdgesProps) {
  const drawn = edges.flatMap((edge) => {
    const from = rectOf(edge.from);
    const to = rectOf(edge.to);
    const faint = edge.kind === "overlap" && !focusClusters.has(edge.from) && !focusClusters.has(edge.to);
    if (!from || !to) return [];
    const pinned = (edge.linkId && ends[edge.linkId]) || {};
    const dragged = endDrag?.edgeId === edge.id ? endDrag : null;
    const geometry =
      dragged?.end === "from"
        ? edgeGeometry(dragged.point, to, { to: pinned.to })
        : dragged?.end === "to"
          ? edgeGeometry(from, dragged.point, { from: pinned.from })
          : edgeGeometry(from, to, pinned);
    return [{ edge, geometry, faint }];
  });
  return (
    <g>
      {drawn.map(({ edge, geometry, faint }) => {
        const style = EDGE_STYLE[edge.kind];
        const marker = edge.paused ? "paused" : style.marker ? edge.kind : null;
        return (
          <g key={edge.id}>
            <path
              d={geometry.d}
              fill="none"
              strokeWidth={selectedId === edge.id ? 2.6 : 1.6}
              strokeDasharray={style.dash}
              className={`${edge.paused ? "stroke-accent" : style.stroke} ${faint ? "opacity-20" : ""}`}
              markerEnd={marker ? `url(#edge-arrow-${marker})` : undefined}
            />
            {edge.linkId && (
              <path
                d={geometry.d}
                fill="none"
                strokeWidth={14}
                className="cursor-pointer stroke-transparent"
                pointerEvents="stroke"
                data-edge={edge.id}
                onClick={() => onSelect(edge)}
              />
            )}
          </g>
        );
      })}
      {drawn.filter((entry) => !entry.faint).map(({ edge, geometry }) => (
        <foreignObject key={`label-${edge.id}`} x={geometry.mid.x - 60} y={geometry.mid.y - 11} width={120} height={22} className="overflow-visible">
          <div className="flex h-full items-center justify-center">
            <button
              type="button"
              data-edge={edge.id}
              title={edge.kind === "overlap" ? edge.files.join("\n") : undefined}
              onClick={() => edge.linkId && onSelect(edge)}
              className={`rounded-full bg-bg px-2 py-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap shadow-[inset_0_0_0_1px_var(--hair)] ${
                edge.paused ? "text-accent" : EDGE_STYLE[edge.kind].pill
              } ${edge.linkId ? "cursor-pointer hover:bg-tint" : "cursor-default"}`}
            >
              {edgeLabel(edge)}
            </button>
          </div>
        </foreignObject>
      ))}
      {drawn
        .filter(({ edge }) => edge.id === selectedId && edge.linkId)
        .flatMap(({ edge, geometry }) =>
          (["from", "to"] as const).map((end) => {
            const at = end === "from" ? geometry.start : geometry.end;
            return (
              <circle
                key={`${edge.id}-${end}`}
                cx={at.x}
                cy={at.y}
                r={6}
                strokeWidth={2}
                data-end={end}
                data-edge-id={edge.id}
                className="cursor-move fill-bg stroke-focus"
              >
                <title>끌어서 다른 면이나 다른 상자로 옮기기</title>
              </circle>
            );
          }),
        )}
    </g>
  );
}
