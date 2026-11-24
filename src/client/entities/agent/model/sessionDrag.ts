import { thisWindowId } from "./sessionWindowChannel";

// Custom types only: Finder turns text or URL drag data dropped on the desktop into a file.
const SESSION_TYPE = "application/x-agent-control-session";
const FROM_PREFIX = "application/x-agent-control-from-";

/** The part of `DataTransfer` a session drag uses; the drop side can read `types` during dragover. */
export interface SessionDragData {
  setData: (type: string, value: string) => void;
  getData: (type: string) => string;
  readonly types: readonly string[];
}

/**
 * The window a drag started in rides along as a type of its own: data is unreadable until the drop,
 * but types can be read while hovering, which lets a window refuse a tab it already holds.
 */
export function setSessionDrag(data: SessionDragData, agentId: string): void {
  data.setData(SESSION_TYPE, agentId);
  data.setData(`${FROM_PREFIX}${thisWindowId()}`, "1");
}

export function acceptsSessionDrag(data: Pick<SessionDragData, "types">): boolean {
  return data.types.includes(SESSION_TYPE) && !data.types.includes(`${FROM_PREFIX}${thisWindowId()}`);
}

export function droppedSessionId(data: Pick<SessionDragData, "getData">): string | null {
  return data.getData(SESSION_TYPE) || null;
}
