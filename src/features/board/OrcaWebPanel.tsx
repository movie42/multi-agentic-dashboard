"use client";

import { useEffect } from "react";

interface OrcaWebPanelProps {
  url: string;
  onClose: () => void;
}

export function OrcaWebPanel({ url, onClose }: OrcaWebPanelProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-fg/20 p-4" onMouseDown={onClose}>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-hair bg-bg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-hair px-4 py-2 text-[13px]">
          <span className="font-semibold">Orca 화면</span>
          <span className="text-muted">헤드리스 런타임에 연결된 Orca 웹 클라이언트</span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-muted underline decoration-faint underline-offset-[3px] hover:text-fg"
          >
            새 창으로
          </a>
          <button type="button" onClick={onClose} className="rounded-full bg-tint px-3 py-1 text-muted hover:text-fg">
            닫기
          </button>
        </div>
        <iframe src={url} title="Orca" className="min-h-0 flex-1 border-0" />
      </div>
    </div>
  );
}
