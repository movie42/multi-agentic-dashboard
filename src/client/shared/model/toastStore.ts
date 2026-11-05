import { create } from "zustand";
import { errorMessage } from "./errorMessage";

export type ToastTone = "error" | "info";

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, tone?: ToastTone) => string;
  dismiss: (id: string) => void;
}

export const TOAST_LIMIT = 4;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  show: (message, tone = "info") => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, tone, message }].slice(-TOAST_LIMIT) }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function toastError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(`[${scope}]`, errorMessage(error), context ?? {}, error);
  useToastStore.getState().show(errorMessage(error), "error");
}
