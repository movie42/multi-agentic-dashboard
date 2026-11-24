import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
