/** Exposed by `desktop/preload.cjs`; absent when the board runs in a plain browser. */
interface DesktopBridge {
  notify(payload: { id: string; title: string; body: string }): void;
  onOpenAgent(callback: (agentId: string) => void): () => void;
}

declare global {
  interface Window {
    agentControl?: DesktopBridge;
  }
}

export function desktopBridge(): DesktopBridge | null {
  return typeof window === "undefined" ? null : (window.agentControl ?? null);
}
