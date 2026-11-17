"use client";

import { useEffect, useEffectEvent } from "react";

interface ModalProps {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ label, onClose, children }: ModalProps) {
  const onEscape = useEffectEvent(onClose);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-fg/20 px-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={label}
        className="flex max-h-[84vh] w-full max-w-2xl flex-col gap-5 overflow-y-auto rounded-[14px] bg-bg p-6 font-sans shadow-[0_24px_64px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]"
        onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
