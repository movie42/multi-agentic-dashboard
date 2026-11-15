"use client";

import { useEffect, useState } from "react";

export function useScrolledPast<T extends Element>(topOffsetPx = 0) {
  const [node, setNode] = useState<T | null>(null);
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.top < topOffsetPx);
      },
      { rootMargin: `-${topOffsetPx}px 0px 0px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, topOffsetPx]);

  return [setNode, past] as const;
}
