"use client";

import type { GraphPort, PortRoute } from "../model/graph";
import { edgeGeometry, type Rect } from "../model/layout";

const ROUTE_LABEL: Record<PortRoute["direction"], (route: PortRoute) => string> = {
  out: (route) => `일꾼 ${route.count}`,
  home: () => "지휘자 자리",
};

const VOYAGE_SECONDS = 7;

interface SeaRoutesProps {
  ports: GraphPort[];
  portRects: ReadonlyMap<string, Rect>;
  rectOf: (id: string) => Rect | null;
  onOpen: (repo: string, worktreeId: string) => void;
}

/**
 * Routes to other projects' worktrees, drawn like a sea chart: a dotted course from a session here up
 * to a far-off port, with a ship sailing it — outward toward workers there, homeward from a conductor
 * that lives there. Clicking a port or its route label goes to that worktree.
 */
export function SeaRoutes({ ports, portRects, rectOf, onOpen }: SeaRoutesProps) {
  const routes = ports.flatMap((port) => {
    const portRect = portRects.get(port.id);
    if (!portRect) return [];
    return port.routes.flatMap((route) => {
      const nodeRect = rectOf(route.nodeId);
      if (!nodeRect) return [];
      return [{ port, route, geometry: edgeGeometry(nodeRect, portRect, { from: "top", to: "bottom" }) }];
    });
  });
  return (
    <g>
      {routes.map(({ port, route, geometry }) => (
        <g key={`${port.id}-${route.nodeId}-${route.direction}`} className="pointer-events-none">
          <path d={geometry.d} fill="none" strokeWidth={7} strokeLinecap="round" className="stroke-now/10" />
          <path d={geometry.d} fill="none" strokeWidth={3} strokeLinecap="round" strokeDasharray="0.1 9" className="stroke-now" />
          <circle cx={geometry.end.x} cy={geometry.end.y} r={5} strokeWidth={2} className="fill-bg stroke-now" />
          <circle r={4} className="fill-now motion-reduce:hidden">
            <animateMotion
              dur={`${VOYAGE_SECONDS}s`}
              repeatCount="indefinite"
              path={geometry.d}
              keyPoints={route.direction === "out" ? "0;1" : "1;0"}
              keyTimes="0;1"
              calcMode="linear"
            />
          </circle>
        </g>
      ))}
      {routes.map(({ port, route, geometry }) => (
        <foreignObject
          key={`label-${port.id}-${route.nodeId}-${route.direction}`}
          x={geometry.mid.x - 60}
          y={geometry.mid.y - 11}
          width={120}
          height={22}
          className="overflow-visible"
        >
          <div className="flex h-full items-center justify-center">
            <button
              type="button"
              onClick={() => onOpen(port.repo, port.worktreeId)}
              className="cursor-pointer rounded-full bg-bg px-2 py-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap text-now shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint"
            >
              {ROUTE_LABEL[route.direction](route)}
            </button>
          </div>
        </foreignObject>
      ))}
      {ports.map((port) => {
        const rect = portRects.get(port.id);
        if (!rect) return null;
        return (
          <foreignObject key={port.id} x={rect.x} y={rect.y} width={rect.w} height={rect.h} data-port={port.id} className="overflow-visible">
            <button
              type="button"
              onClick={() => onOpen(port.repo, port.worktreeId)}
              title={`${port.repo} 프로젝트의 ${port.worktreeName} 워크트리로 가기`}
              className="flex h-full w-full cursor-pointer flex-col justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-now/60 bg-now/5 px-3 text-left text-now hover:border-now hover:bg-now/10"
            >
              <span className="flex w-full items-center gap-1.5 text-[13px] leading-none font-bold">
                <span className="truncate">{port.repo}</span>
                <span aria-hidden className="ml-auto shrink-0">
                  ↗
                </span>
              </span>
              <span className="truncate text-[11px] leading-none text-muted">{port.worktreeName}</span>
            </button>
          </foreignObject>
        );
      })}
    </g>
  );
}
