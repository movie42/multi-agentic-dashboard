"use client";

import { useEffect } from "react";
import { useToastStore, type Toast } from "../model/toastStore";

const TOAST_MS = 6000;

interface ToastItemProps {
  toast: Toast;
}

function ToastItem({ toast }: ToastItemProps) {
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => useToastStore.getState().dismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <li
      role={toast.tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-[10px] bg-fg px-4 py-3 text-[13px] leading-relaxed text-bg shadow-lg ${
        toast.tone === "error" ? "shadow-[inset_3px_0_0_var(--accent)]" : ""
      }`}
    >
      <span className="flex-1 break-words">{toast.message}</span>
      <button type="button" onClick={() => dismiss(toast.id)} className="shrink-0 text-[12px] opacity-70 hover:opacity-100">
        닫기
      </button>
    </li>
  );
}

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  if (toasts.length === 0) return null;
  return (
    <ul className="fixed right-4 bottom-4 z-50 flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </ul>
  );
}
