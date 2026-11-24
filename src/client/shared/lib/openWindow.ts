import { useToastStore } from "@/client/shared/model/toastStore";

export interface WindowSize {
  width: number;
  height: number;
}

/** Where on the screen a window's top-left corner goes, e.g. under a tab dropped outside the app. */
export interface ScreenPoint {
  left: number;
  top: number;
}

/**
 * A separate window on our own origin; the desktop shell turns it into an app window. A `name`
 * brings back the window already open under it instead of opening a second one.
 */
export function openWindow(url: string, size: WindowSize, name = "_blank", at?: ScreenPoint): boolean {
  const width = Math.min(size.width, window.screen.availWidth);
  const height = Math.min(size.height, window.screen.availHeight);
  const position = at ? `,left=${at.left},top=${at.top}` : "";
  if (!window.open(url, name, `popup,width=${width},height=${height}${position}`)) {
    useToastStore.getState().show("새 창을 열지 못했어요. 팝업 차단을 확인해 주세요.", "error");
    return false;
  }
  return true;
}
