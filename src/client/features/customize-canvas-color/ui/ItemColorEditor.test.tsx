import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStoredListStore } from "@/client/shared/lib/storedListStore";
import { CanvasItemColorStyle } from "./CanvasItemColorStyle";
import { ItemColorEditor } from "./ItemColorEditor";

afterEach(() => {
  window.localStorage.clear();
  useStoredListStore.setState({ lists: {} });
});

const styleText = (container: HTMLElement) => container.querySelector("style")?.textContent ?? "";

describe("ItemColorEditor", () => {
  it("colours one worktree frame through its own rule, and resets it back to the canvas colours", async () => {
    const { container } = render(
      <>
        <CanvasItemColorStyle />
        <ItemColorEditor targets={[{ scope: "worktree", id: "/p/shop-a" }]} title="워크트리 · shop-a" at={{ x: 10, y: 10 }} onClose={vi.fn()} />
      </>,
    );
    fireEvent.change(screen.getByLabelText("라인 색"), { target: { value: "#112233" } });
    fireEvent.change(screen.getByLabelText("글자 색"), { target: { value: "#f0f0f0" } });

    const rule = styleText(container);
    expect(rule).toContain('[data-color-key="worktree:/p/shop-a"]');
    expect(rule).toContain("--canvas-worktree-line-custom:#112233");
    expect(rule).toContain("--canvas-worktree-ink-custom:#f0f0f0");
    expect(rule).toContain("--canvas-worktree-soft-custom:color-mix(in oklab, #f0f0f0 70%, transparent)");
    expect(rule).not.toContain("--canvas-worktree-fill-custom");

    await userEvent.click(screen.getByRole("button", { name: "기본 색으로" }));
    expect(styleText(container)).toBe("");
  });

  it("offers a card only its background and text — the border is the session state's colour", () => {
    render(<ItemColorEditor targets={[{ scope: "card", id: "s1" }]} title="구현" at={{ x: 0, y: 0 }} onClose={vi.fn()} />);
    expect(screen.queryByLabelText("라인 색")).toBeNull();
    expect(screen.getByLabelText("배경 색")).toBeTruthy();
    expect(screen.getByLabelText("글자 색")).toBeTruthy();
  });

  it("colours every target at once and keeps the colours after a reload", () => {
    const { container, unmount } = render(
      <>
        <CanvasItemColorStyle />
        <ItemColorEditor
          targets={[
            { scope: "card", id: "s1" },
            { scope: "card", id: "s2" },
          ]}
          title="고른 세션 2개"
          at={{ x: 0, y: 0 }}
          onClose={vi.fn()}
        />
      </>,
    );
    fireEvent.change(screen.getByLabelText("배경 색"), { target: { value: "#abcdef" } });
    expect(styleText(container)).toContain('[data-color-key="card:s1"]{--canvas-card-fill-custom:#abcdef}');
    expect(styleText(container)).toContain('[data-color-key="card:s2"]{--canvas-card-fill-custom:#abcdef}');
    unmount();

    useStoredListStore.setState({ lists: {} });
    const reloaded = render(<CanvasItemColorStyle />);
    expect(styleText(reloaded.container)).toContain('[data-color-key="card:s2"]{--canvas-card-fill-custom:#abcdef}');
  });
});
