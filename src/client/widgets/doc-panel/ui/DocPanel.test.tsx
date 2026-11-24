import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { thisWindowId } from "@/client/entities/agent";
import { useDocViewerStore } from "@/client/features/view-doc";
import { DocPanel } from "./DocPanel";

const DOC = "/w/docs/d/A/index.html";

// jsdom has no DragEvent, so a dragend would lose its screen coordinates.
if (!("DragEvent" in window)) {
  Object.defineProperty(window, "DragEvent", { value: class extends MouseEvent {} });
}

function renderPanel(onCollapse = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DocPanel
        agents={[]}
        lead={{
          tabs: [{ id: "a", label: "결제 API", content: <p>세션 내용</p>, closable: true }],
          activeId: "a",
          onActivate: vi.fn(),
          onClose: vi.fn(),
          onCollapse,
        }}
      />
    </QueryClientProvider>,
  );
  return onCollapse;
}

const visible = (text: string) => !screen.getByText(text).closest(".invisible");

describe("DocPanel with a lead tab", () => {
  afterEach(() => useDocViewerStore.getState().closeAll());

  it("stays open with only the lead tab and folds through the host", () => {
    const onCollapse = renderPanel();
    expect(screen.getByRole("tab", { name: /결제 API/ }).getAttribute("aria-selected")).toBe("true");
    expect(visible("세션 내용")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "오른쪽 패널 접기" }));
    expect(onCollapse).toHaveBeenCalled();
  });

  it("puts an opened document in a tab beside the lead and switches back", () => {
    useDocViewerStore.getState().open(DOC);
    renderPanel();
    expect(visible("세션 내용")).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: /결제 API/ }));
    expect(visible("세션 내용")).toBe(true);
    expect(useDocViewerStore.getState().tabs).toHaveLength(1);
  });

  it("keeps several session tabs and hands activation and closing to the host", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DocPanel
          agents={[]}
          lead={{
            tabs: [
              { id: "a", label: "결제 API", content: <p>A 내용</p>, closable: true },
              { id: "b", label: "터미널", content: <p>B 내용</p>, closable: true },
            ],
            activeId: "b",
            onActivate,
            onClose,
            onCollapse: vi.fn(),
          }}
        />
      </QueryClientProvider>,
    );
    expect(visible("B 내용")).toBe(true);
    expect(visible("A 내용")).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: /결제 API/ }));
    expect(onActivate).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: "터미널 닫기" }));
    expect(onClose).toHaveBeenCalledWith("b");
  });

  const drag = (tab: HTMLElement, at: { screenX: number; screenY: number }) => {
    fireEvent.dragStart(tab, { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });
    fireEvent.dragEnd(tab, at);
  };
  const OUTSIDE = { screenX: window.outerWidth + 300, screenY: 200 };

  it("hands a session tab dropped outside the window to the host as a new window", () => {
    const onDetach = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DocPanel
          agents={[]}
          lead={{
            tabs: [{ id: "a", label: "결제 API", content: <p>세션 내용</p>, closable: true, onDetach }],
            activeId: "a",
            onActivate: vi.fn(),
            onClose: vi.fn(),
            onCollapse: vi.fn(),
          }}
        />
      </QueryClientProvider>,
    );
    const tab = screen.getByRole("tab", { name: /결제 API/ });
    expect(tab.getAttribute("draggable")).toBe("true");
    drag(tab, { screenX: 40, screenY: 40 });
    expect(onDetach).not.toHaveBeenCalled();
    drag(tab, OUTSIDE);
    expect(onDetach).toHaveBeenCalledWith({ left: OUTSIDE.screenX - 120, top: OUTSIDE.screenY - 16 });
  });

  it("does not let a lead tab that cannot leave be dragged", () => {
    renderPanel();
    expect(screen.getByRole("tab", { name: /결제 API/ }).getAttribute("draggable")).not.toBe("true");
  });

  it("opens a document tab dropped outside the window in its own window and closes the tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    useDocViewerStore.getState().open(DOC);
    renderPanel();
    drag(screen.getAllByRole("tab")[1]!, OUTSIDE);
    expect(open).toHaveBeenCalledWith(`/doc?path=${encodeURIComponent(DOC)}`, "_blank", expect.stringContaining(`left=${OUTSIDE.screenX - 120}`));
    expect(useDocViewerStore.getState().tabs).toHaveLength(0);
  });

  const sessionDrop = (from: string, agentId: string) => ({
    dataTransfer: {
      types: ["application/x-agent-control-session", `application/x-agent-control-from-${from}`],
      getData: (type: string) => (type === "application/x-agent-control-session" ? agentId : ""),
      dropEffect: "none",
    },
  });

  it("hands a session tab dropped on its tab strip from another window to the host", () => {
    const onDropSession = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DocPanel
          agents={[]}
          lead={{
            tabs: [{ id: "a", label: "결제 API", content: <p>세션 내용</p>, closable: true }],
            activeId: "a",
            onActivate: vi.fn(),
            onClose: vi.fn(),
            onCollapse: vi.fn(),
            onDropSession,
          }}
        />
      </QueryClientProvider>,
    );
    const strip = screen.getByRole("tablist");
    fireEvent.drop(strip, sessionDrop(thisWindowId(), "a"));
    expect(onDropSession).not.toHaveBeenCalled();
    fireEvent.dragOver(strip, sessionDrop("w-other", "s9"));
    fireEvent.drop(strip, sessionDrop("w-other", "s9"));
    expect(onDropSession).toHaveBeenCalledWith("s9");
  });

  it("lets a session tab go, without a new window, once another window's tab strip took it", () => {
    const onDetach = vi.fn();
    const onMoved = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DocPanel
          agents={[]}
          lead={{
            tabs: [{ id: "a", label: "결제 API", content: <p>세션 내용</p>, closable: true, onDetach, onMoved, sessionId: "a" }],
            activeId: "a",
            onActivate: vi.fn(),
            onClose: vi.fn(),
            onCollapse: vi.fn(),
          }}
        />
      </QueryClientProvider>,
    );
    const tab = screen.getByRole("tab", { name: /결제 API/ });
    fireEvent.dragStart(tab, { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });
    fireEvent.dragEnd(tab, { ...OUTSIDE, dataTransfer: { dropEffect: "move" } });
    expect(onMoved).toHaveBeenCalled();
    expect(onDetach).not.toHaveBeenCalled();
  });

  it("still opens a document tab in its own window when the drop reports a move", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    useDocViewerStore.getState().open(DOC);
    renderPanel();
    const tab = screen.getAllByRole("tab")[1]!;
    fireEvent.dragStart(tab, { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });
    fireEvent.dragEnd(tab, { ...OUTSIDE, dataTransfer: { dropEffect: "move" } });
    expect(open).toHaveBeenCalled();
  });
});
