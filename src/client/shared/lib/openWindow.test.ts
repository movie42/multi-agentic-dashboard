import { afterEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "@/client/shared/model/toastStore";
import { openWindow } from "./openWindow";

afterEach(() => useToastStore.setState({ toasts: [] }));

describe("openWindow", () => {
  it("opens the URL as a sized popup window", () => {
    const open = vi.fn(() => ({}) as Window);
    vi.stubGlobal("window", { open, screen: { availWidth: 3000, availHeight: 2000 } });
    openWindow("/session?id=a", { width: 760, height: 900 });
    expect(open).toHaveBeenCalledWith("/session?id=a", "_blank", "popup,width=760,height=900");
    vi.unstubAllGlobals();
  });

  it("reuses the window of the same name instead of opening a second one", () => {
    const open = vi.fn(() => ({}) as Window);
    vi.stubGlobal("window", { open, screen: { availWidth: 3000, availHeight: 2000 } });
    openWindow("/session?id=a", { width: 760, height: 900 }, "session:a");
    expect(open).toHaveBeenCalledWith("/session?id=a", "session:a", "popup,width=760,height=900");
    vi.unstubAllGlobals();
  });

  it("puts the window where it was dropped", () => {
    const open = vi.fn(() => ({}) as Window);
    vi.stubGlobal("window", { open, screen: { availWidth: 3000, availHeight: 2000 } });
    expect(openWindow("/doc", { width: 800, height: 600 }, "_blank", { left: 900, top: 40 })).toBe(true);
    expect(open).toHaveBeenCalledWith("/doc", "_blank", "popup,width=800,height=600,left=900,top=40");
    vi.unstubAllGlobals();
  });

  it("keeps the window inside a smaller screen", () => {
    const open = vi.fn(() => ({}) as Window);
    vi.stubGlobal("window", { open, screen: { availWidth: 1280, availHeight: 800 } });
    openWindow("/", { width: 1440, height: 960 });
    expect(open).toHaveBeenCalledWith("/", "_blank", "popup,width=1280,height=800");
    vi.unstubAllGlobals();
  });

  it("tells the person when a popup blocker stops the window", () => {
    vi.stubGlobal("window", { open: () => null, screen: { availWidth: 3000, availHeight: 2000 } });
    expect(openWindow("/", { width: 800, height: 600 })).toBe(false);
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(["새 창을 열지 못했어요. 팝업 차단을 확인해 주세요."]);
    vi.unstubAllGlobals();
  });
});
