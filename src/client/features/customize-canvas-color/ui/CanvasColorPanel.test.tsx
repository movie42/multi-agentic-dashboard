import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useStoredListStore } from "@/client/shared/lib/storedListStore";
import { CanvasColorPanel } from "./CanvasColorPanel";
import { CanvasColorSync } from "./CanvasColorSync";

afterEach(() => {
  window.localStorage.clear();
  useStoredListStore.setState({ lists: {} });
  document.documentElement.removeAttribute("style");
});

describe("CanvasColorPanel", () => {
  it("applies picked canvas colours to the page, keeps them, and resets to the default tokens", async () => {
    render(
      <>
        <CanvasColorSync />
        <CanvasColorPanel />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: /캔버스 색/ }));
    fireEvent.change(screen.getByLabelText("캔버스 배경 색"), { target: { value: "#101010" } });
    fireEvent.change(screen.getByLabelText("프로젝트 라인 색"), { target: { value: "#202020" } });
    fireEvent.change(screen.getByLabelText("워크트리 배경 색"), { target: { value: "#303030" } });
    fireEvent.change(screen.getByLabelText("카드 배경 색"), { target: { value: "#404040" } });

    const root = document.documentElement.style;
    expect(root.getPropertyValue("--canvas-bg-custom")).toBe("#101010");
    expect(root.getPropertyValue("--canvas-project-line-custom")).toBe("#202020");
    expect(root.getPropertyValue("--canvas-project-fill-custom")).toBe("");
    expect(root.getPropertyValue("--canvas-worktree-fill-custom")).toBe("#303030");
    expect(root.getPropertyValue("--canvas-card-custom")).toBe("#404040");
    expect(JSON.parse(window.localStorage.getItem("agent-control:canvas-colors") ?? "[]")).toEqual([
      "#101010",
      "#202020",
      "",
      "",
      "#303030",
      "#404040",
    ]);

    await userEvent.click(screen.getByRole("button", { name: "기본 색으로" }));
    expect(root.getPropertyValue("--canvas-bg-custom")).toBe("");
    expect(root.getPropertyValue("--canvas-card-custom")).toBe("");
    expect(window.localStorage.getItem("agent-control:canvas-colors")).toBe("[]");
    expect(screen.queryByRole("button", { name: "기본 색으로" })).toBeNull();
  });

  it("does not offer state colours — a card's border stays tied to its session state", async () => {
    render(<CanvasColorPanel />);
    await userEvent.click(screen.getByRole("button", { name: /캔버스 색/ }));
    expect(screen.queryByLabelText("카드 라인 색")).toBeNull();
  });
});
