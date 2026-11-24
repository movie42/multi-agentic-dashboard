import { useEffect, useRef } from "react";
import { setSessionDrag, watchTaken } from "@/client/entities/agent";
import type { ScreenPoint } from "@/client/shared/lib/openWindow";

// A custom type only: Finder turns text or URL drag data dropped on the desktop into a file.
const DRAG_TYPE = "application/x-agent-control-tab";
/** How long a tab dropped outside waits to hear that another window took it before opening its own. */
const TAKEN_WAIT_MS = 250;

type TakenWatch = ReturnType<typeof watchTaken>;

function droppedOutsideWindow(event: React.DragEvent<HTMLElement>): boolean {
  const { screenX, screenY } = event;
  if (screenX === 0 && screenY === 0) return false;
  return (
    screenX < window.screenX ||
    screenX > window.screenX + window.outerWidth ||
    screenY < window.screenY ||
    screenY > window.screenY + window.outerHeight
  );
}

interface DetachOptions {
  /** A session tab: it carries the session, so another window's tab strip can take it. */
  sessionId?: string;
  /** The tab landed in another window, so it leaves this one. */
  onMoved?: () => void;
}

/** Drag handlers for a panel tab that leaves for its own window when dropped outside the app. */
export function useDetachDrag(id: string, onDetach: (at: ScreenPoint) => void, { sessionId, onMoved }: DetachOptions = {}) {
  // A ref, not a variable: the board re-renders between dragstart and dragend, and each render hands
  // the tab new handlers.
  const watchRef = useRef<TakenWatch | null>(null);
  // A tab taken by another window can unmount before its dragend arrives.
  useEffect(() => () => watchRef.current?.stop(), []);
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(DRAG_TYPE, id);
      if (!sessionId) return;
      setSessionDrag(event.dataTransfer, sessionId);
      watchRef.current?.stop();
      watchRef.current = watchTaken(sessionId);
    },
    onDragEnd: (event: React.DragEvent<HTMLElement>) => {
      const watch = watchRef.current;
      watchRef.current = null;
      if (onMoved && event.dataTransfer?.dropEffect === "move") {
        watch?.stop();
        onMoved?.();
        return;
      }
      if (!droppedOutsideWindow(event)) {
        watch?.stop();
        return;
      }
      const at = { left: event.screenX - 120, top: event.screenY - 16 };
      if (!watch) {
        onDetach(at);
        return;
      }
      // Some drops onto another window report no drop effect here; that window's own news decides.
      void watch.wait(TAKEN_WAIT_MS).then((taken) => (taken ? onMoved?.() : onDetach(at)));
    },
  };
}

export const DETACH_HINT = "창 밖으로 끌면 별도 창으로 열려요";
