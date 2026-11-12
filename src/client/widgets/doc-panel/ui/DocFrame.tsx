"use client";

import { useEffect, useRef } from "react";
import { docLabel, docUrl, targetOfDocUrl } from "@/client/features/view-doc";

interface DocFrameProps {
  target: string;
  className?: string;
  /** Called on every page load inside the frame, including links followed in the document. */
  onNavigate?: (current: string, label: string, pageTitle: string | null) => void;
}

function readPage(frame: HTMLIFrameElement) {
  const view = frame.contentWindow;
  const current = view ? targetOfDocUrl(view.location.pathname) : null;
  if (!view || !current) return null;
  return { current, label: docLabel(current), title: view.document.title || null };
}

export function DocFrame({ target, className = "", onNavigate }: DocFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);

  // A server-rendered frame can finish loading before hydration attaches onLoad.
  useEffect(() => {
    const frame = ref.current;
    if (!frame || frame.contentDocument?.readyState !== "complete") return;
    const page = readPage(frame);
    if (page) onNavigate?.(page.current, page.label, page.title);
    // Only the first mount can miss the load event; later loads arrive through onLoad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <iframe
      ref={ref}
      src={docUrl(target)}
      title={target}
      onLoad={(event: React.SyntheticEvent<HTMLIFrameElement>) => {
        const page = readPage(event.currentTarget);
        if (page) onNavigate?.(page.current, page.label, page.title);
      }}
      className={`h-full w-full border-0 bg-bg ${className}`}
    />
  );
}
