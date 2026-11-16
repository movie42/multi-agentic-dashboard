"use client";

import { useEffect, useState } from "react";

const MIN_SCALE = 0.3;
const MAX_SCALE = 1.6;
const FIT_MARGIN = 72;
const FIT_TOP = 64;

interface View {
  x: number;
  y: number;
  k: number;
}

const clamp = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/**
 * Pan and zoom for an SVG canvas: drag the background to pan, wheel to scroll, ⌘/Ctrl + wheel or a
 * pinch to zoom around the cursor. The view fits the content until the user moves it.
 */
export function useViewport(contentWidth: number, contentHeight: number) {
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [drag, setDrag] = useState<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const [touched, setTouched] = useState(false);
  const fitView = (target: SVGSVGElement | null, w: number, h: number): View | null => {
    if (!target) return null;
    const { width, height } = target.getBoundingClientRect();
    if (width === 0 || height === 0) return null;
    const k = clamp(Math.min(1, (width - FIT_MARGIN * 2) / Math.max(w, 1), (height - FIT_TOP - FIT_MARGIN) / Math.max(h, 1)));
    return { k, x: (width - w * k) / 2, y: FIT_TOP + Math.max(0, (height - FIT_TOP - FIT_MARGIN - h * k) / 2) };
  };

  const fit = () => {
    const next = fitView(svg, contentWidth, contentHeight);
    if (!next) return;
    setTouched(false);
    setView(next);
  };

  useEffect(() => {
    if (!svg) return;
    const refit = () => {
      if (touched) return;
      const next = fitView(svg, contentWidth, contentHeight);
      if (next) setView(next);
    };
    const observer = new ResizeObserver(refit);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svg, contentWidth, contentHeight, touched]);

  useEffect(() => {
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setTouched(true);
      if (event.ctrlKey || event.metaKey) {
        const rect = svg.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        setView((current) => {
          const k = clamp(current.k * Math.exp(-event.deltaY * 0.01));
          return { k, x: px - ((px - current.x) * k) / current.k, y: py - ((py - current.y) * k) / current.k };
        });
        return;
      }
      setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svg]);

  const zoomBy = (factor: number) => {
    if (!svg) return;
    setTouched(true);
    const { width, height } = svg.getBoundingClientRect();
    setView((current) => {
      const k = clamp(current.k * factor);
      return { k, x: width / 2 - ((width / 2 - current.x) * k) / current.k, y: height / 2 - ((height / 2 - current.y) * k) / current.k };
    });
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, textarea")) return;
    setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false });
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) event.currentTarget.setPointerCapture(event.pointerId);
    setTouched(true);
    setDrag({ pointerId: drag.pointerId, x: event.clientX, y: event.clientY, moved: true });
    setView((view) => ({ ...view, x: view.x + dx, y: view.y + dy }));
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const moved = drag?.moved ?? false;
    setDrag(null);
    if (!moved) return;
    // A drag ends with a click on the background; swallow it so the selection stays.
    const swallow = (click: MouseEvent) => {
      click.stopPropagation();
      window.removeEventListener("click", swallow, true);
    };
    window.addEventListener("click", swallow, true);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    attach: setSvg,
    transform: `translate(${view.x} ${view.y}) scale(${view.k})`,
    patternTransform: `translate(${view.x} ${view.y}) scale(${view.k})`,
    dragging: drag?.moved ?? false,
    fit,
    zoomBy,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
