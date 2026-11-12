"use client";

import { useEffect, useState } from "react";
import { DocFrame, openInBrowser } from "@/client/widgets/doc-panel";

interface DocWindowProps {
  target: string;
}

export function DocWindow({ target }: DocWindowProps) {
  const [page, setPage] = useState<{ current: string; title: string | null }>({ current: target, title: null });
  useEffect(() => {
    if (page.title) document.title = page.title;
  }, [page.title]);
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-hair bg-tint px-4 py-2 text-[13px]">
        <span className="min-w-0 flex-1 truncate font-semibold">{page.title ?? page.current}</span>
        <button
          type="button"
          onClick={() => openInBrowser(page.current)}
          className="shrink-0 underline decoration-faint underline-offset-[3px] hover:decoration-current"
        >
          브라우저로 열기
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <DocFrame target={target} onNavigate={(current, _label, title) => setPage({ current, title })} />
      </div>
    </div>
  );
}
