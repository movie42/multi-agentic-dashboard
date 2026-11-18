"use client";

import type { EdgeKind, GraphEdge } from "../model/graph";
import { edgeGeometry, sharedLanes, type EdgeEnds, type EdgeGeometry, type Point, type Rect } from "../model/layout";

export const EDGE_STYLE: Record<EdgeKind, { label: string; stroke: string; dash?: string; marker: boolean; pill: string }> = {
  delegate: { label: "맡김", stroke: "stroke-fg", marker: true, pill: "text-fg" },
  report: { label: "보고", stroke: "stroke-now", dash: "6 5", marker: true, pill: "text-now" },
  next: { label: "끝나면", stroke: "stroke-muted", marker: true, pill: "text-muted" },
  watch: { label: "터미널", stroke: "stroke-muted", dash: "1 4", marker: true, pill: "text-muted" },
  fork: { label: "갈라짐", stroke: "stroke-faint", dash: "2 5", marker: false, pill: "text-muted" },
  overlap: { label: "같은 파일", stroke: "stroke-ask", dash: "6 5", marker: false, pill: "text-ask" },
};

const MARKER_KINDS = ["delegate", "report", "next", "watch", "paused"] as const;
const MARKER_FILL: Record<(typeof MARKER_KINDS)[number], string> = {
  delegate: "fill-fg",
  report: "fill-now",
  next: "fill-muted",
  watch: "fill-muted",
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
  if (edge.route?.label) return `${EDGE_STYLE[edge.kind].label} · ${edge.route.label}`;
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

const LABEL_STEP = 24;

interface Lane {
  edges: GraphEdge[];
  /** The line whose direction, style and pinned sides the shared curve follows. */
  lead: GraphEdge;
  geometry: EdgeGeometry;
  faint: boolean;
}

/** Start and end of the lane curve as seen from this line, which may run against the lead. */
function endsOf(lane: Lane, edge: GraphEdge): { start: Point; end: Point } {
  const forward = edge.from === lane.lead.from;
  return forward ? { start: lane.geometry.start, end: lane.geometry.end } : { start: lane.geometry.end, end: lane.geometry.start };
}

/**
 * Lines joining the same two boxes share one curve with their labels stacked on it; the arrow
 * of a line running against the lead sits at the curve's start. Lines first, then their
 * labels, so a label is never covered by another line.
 */
export function GraphEdges({ edges, rectOf, ends, endDrag, selectedId, focusClusters, onSelect }: GraphEdgesProps) {
  const isFaint = (edge: GraphEdge) => edge.kind === "overlap" && !focusClusters.has(edge.from) && !focusClusters.has(edge.to);
  const pinsOf = (edge: GraphEdge): EdgeEnds => (edge.linkId && ends[edge.linkId]) || {};
  const dragged = endDrag ? edges.find((edge) => edge.id === endDrag.edgeId) : undefined;
  const groups = sharedLanes(edges.filter((edge) => edge !== dragged));
  const lanes: Lane[] = groups.flatMap((group) => {
    const lead = group.find((edge) => !isFaint(edge)) ?? group[0];
    if (!lead) return [];
    const from = rectOf(lead.from);
    const to = rectOf(lead.to);
    if (!from || !to) return [];
    const inLeadDirection = (edge: GraphEdge): EdgeEnds => {
      const pins = pinsOf(edge);
      return edge.from === lead.from ? pins : { from: pins.to, to: pins.from };
    };
    const selected = group.find((edge) => edge.id === selectedId);
    const pinned = [selected, lead, ...group].reduceRight<EdgeEnds>((acc, edge) => (edge ? { ...acc, ...stripUnset(inLeadDirection(edge)) } : acc), {});
    return [{ edges: group, lead, geometry: edgeGeometry(from, to, pinned), faint: group.every(isFaint) }];
  });
  if (dragged && endDrag) {
    const from = rectOf(dragged.from);
    const to = rectOf(dragged.to);
    const pinned = pinsOf(dragged);
    const geometry =
      endDrag.end === "from" && to
        ? edgeGeometry(endDrag.point, to, { to: pinned.to })
        : endDrag.end === "to" && from
          ? edgeGeometry(from, endDrag.point, { from: pinned.from })
          : null;
    if (geometry) lanes.push({ edges: [dragged], lead: dragged, geometry, faint: false });
  }
  const clickable = (edge: GraphEdge) => Boolean(edge.linkId || edge.route);
  return (
    <g>
      {lanes.map((lane) => {
        const { lead, geometry } = lane;
        const style = EDGE_STYLE[lead.kind];
        const markerOf = (edge: GraphEdge) => (edge.paused ? "paused" : EDGE_STYLE[edge.kind].marker ? edge.kind : null);
        const endMarker = lane.edges.map((edge) => (edge.from === lead.from ? markerOf(edge) : null)).find(Boolean);
        const startMarker = lane.edges.map((edge) => (edge.from !== lead.from ? markerOf(edge) : null)).find(Boolean);
        const target = lane.edges.find(clickable);
        return (
          <g key={lead.id}>
            <path
              d={geometry.d}
              fill="none"
              strokeWidth={lane.edges.some((edge) => edge.id === selectedId) ? 2.6 : 1.6}
              strokeDasharray={style.dash}
              className={`${lead.paused ? "stroke-accent" : style.stroke} ${lane.faint ? "opacity-20" : ""}`}
              markerEnd={endMarker ? `url(#edge-arrow-${endMarker})` : undefined}
              markerStart={startMarker ? `url(#edge-arrow-${startMarker})` : undefined}
            />
            {target && (
              <path
                d={geometry.d}
                fill="none"
                strokeWidth={14}
                className="cursor-pointer stroke-transparent"
                pointerEvents="stroke"
                data-edge={target.id}
                onClick={() => onSelect(target)}
              />
            )}
          </g>
        );
      })}
      {lanes.flatMap((lane) => {
        const labeled = lane.edges.filter((edge) => !isFaint(edge));
        return labeled.map((edge, index) => {
          const y = lane.geometry.mid.y + (index - (labeled.length - 1) / 2) * LABEL_STEP;
          return (
            <foreignObject key={`label-${edge.id}`} x={lane.geometry.mid.x - 60} y={y - 11} width={120} height={22} className="overflow-visible">
              <div className="flex h-full items-center justify-center">
                <button
                  type="button"
                  data-edge={edge.id}
                  title={edge.kind === "overlap" ? edge.files.join("\n") : undefined}
                  onClick={() => clickable(edge) && onSelect(edge)}
                  className={`rounded-full bg-bg px-2 py-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap shadow-[inset_0_0_0_1px_var(--hair)] ${
                    edge.paused ? "text-accent" : EDGE_STYLE[edge.kind].pill
                  } ${edge.id === selectedId ? "shadow-[inset_0_0_0_1.5px_currentColor]" : ""} ${clickable(edge) ? "cursor-pointer hover:bg-tint" : "cursor-default"}`}
                >
                  {edgeLabel(edge)}
                </button>
              </div>
            </foreignObject>
          );
        });
      })}
      {lanes.flatMap((lane) =>
        lane.edges
          .filter((edge) => edge.id === selectedId && edge.linkId)
          .flatMap((edge) => {
            const at = endsOf(lane, edge);
            return (["from", "to"] as const).map((end) => {
              const point = end === "from" ? at.start : at.end;
              return (
                <circle
                  key={`${edge.id}-${end}`}
                  cx={point.x}
                  cy={point.y}
                  r={6}
                  strokeWidth={2}
                  data-end={end}
                  data-edge-id={edge.id}
                  className="cursor-move fill-bg stroke-focus"
                >
                  <title>끌어서 다른 면이나 다른 상자로 옮기기</title>
                </circle>
              );
            });
          }),
      )}
    </g>
  );
}

function stripUnset(ends: EdgeEnds): EdgeEnds {
  return { ...(ends.from && { from: ends.from }), ...(ends.to && { to: ends.to }) };
}
