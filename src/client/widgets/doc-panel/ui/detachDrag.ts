import type { ScreenPoint } from "@/client/shared/lib/openWindow";

// A custom type only: Finder turns text or URL drag data dropped on the desktop into a file.
const DRAG_TYPE = "application/x-agent-control-tab";

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

/** Drag handlers for a panel tab that leaves for its own window when dropped outside the app. */
export function detachDrag(id: string, onDetach: (at: ScreenPoint) => void) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(DRAG_TYPE, id);
    },
    onDragEnd: (event: React.DragEvent<HTMLElement>) => {
      if (droppedOutsideWindow(event)) onDetach({ left: event.screenX - 120, top: event.screenY - 16 });
    },
  };
}

export const DETACH_HINT = "창 밖으로 끌면 별도 창으로 열려요";
