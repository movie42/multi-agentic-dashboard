import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDocViewerStore } from "@/client/features/view-doc";
import { DocPanel } from "./DocPanel";

const DOC = "/w/docs/d/A/index.html";

function renderPanel(onCollapse = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DocPanel agents={[]} lead={{ label: "결제 API", content: <p>세션 내용</p>, onCollapse }} />
    </QueryClientProvider>,
  );
  return onCollapse;
}

const visible = (text: string) => !screen.getByText(text).closest(".invisible");

describe("DocPanel with a lead tab", () => {
  afterEach(() => useDocViewerStore.getState().closeAll());

  it("stays open with only the lead tab and folds through the host", () => {
    const onCollapse = renderPanel();
    expect(screen.getByRole("tab", { name: "결제 API" }).getAttribute("aria-selected")).toBe("true");
    expect(visible("세션 내용")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "오른쪽 패널 접기" }));
    expect(onCollapse).toHaveBeenCalled();
  });

  it("puts an opened document in a tab beside the lead and switches back", () => {
    useDocViewerStore.getState().open(DOC);
    renderPanel();
    expect(visible("세션 내용")).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "결제 API" }));
    expect(visible("세션 내용")).toBe(true);
    expect(useDocViewerStore.getState().tabs).toHaveLength(1);
  });
});
