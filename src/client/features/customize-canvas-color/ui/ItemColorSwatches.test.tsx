import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStoredListStore } from "@/client/shared/lib/storedListStore";
import { CanvasItemColorStyle } from "./CanvasItemColorStyle";
import { ItemColorEditor } from "./ItemColorEditor";
import { ItemColorSwatches } from "./ItemColorSwatches";

afterEach(() => {
  window.localStorage.clear();
  useStoredListStore.setState({ lists: {} });
});

const styleText = (container: HTMLElement) => container.querySelector("style")?.textContent ?? "";
const worktree = [{ scope: "worktree" as const, id: "/p/shop-a" }];

describe("ItemColorSwatches", () => {
  it("paints line, background and text with one click, from tokens that follow light and dark mode", async () => {
    const { container } = render(
      <>
        <CanvasItemColorStyle />
        <ItemColorSwatches targets={worktree} onCustom={vi.fn()} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "파랑" }));

    const rule = styleText(container);
    expect(rule).toContain('[data-color-key="worktree:/p/shop-a"]{');
    expect(rule).toContain("--canvas-worktree-line-custom:var(--swatch-blue)");
    expect(rule).toContain("--canvas-worktree-fill-custom:color-mix(in oklab, var(--swatch-blue) 14%, var(--bg))");
    expect(rule).toContain("--canvas-worktree-ink-custom:color-mix(in oklab, var(--swatch-blue) 55%, var(--fg))");
    expect(screen.getByRole("button", { name: "파랑" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("drops colours picked one by one when a swatch is chosen, so the swatch shows as it is", async () => {
    const { container } = render(
      <>
        <CanvasItemColorStyle />
        <ItemColorEditor targets={worktree} title="워크트리 · shop-a" at={{ x: 0, y: 0 }} onClose={vi.fn()} />
        <ItemColorSwatches targets={worktree} onCustom={vi.fn()} />
      </>,
    );
    fireEvent.change(screen.getByLabelText("라인 색"), { target: { value: "#112233" } });
    await userEvent.click(screen.getByRole("button", { name: "초록" }));
    expect(styleText(container)).not.toContain("#112233");
    expect(styleText(container)).toContain("var(--swatch-green)");
  });

  it("lets a card take only background and text from a swatch", async () => {
    const { container } = render(
      <>
        <CanvasItemColorStyle />
        <ItemColorSwatches targets={[{ scope: "card", id: "s1" }]} onCustom={vi.fn()} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "빨강" }));
    expect(styleText(container)).toContain("--canvas-card-fill-custom:");
    expect(styleText(container)).not.toContain("--canvas-card-line-custom");
  });

  it("goes back to the canvas colours, and opens the full editor from '직접'", async () => {
    const onCustom = vi.fn();
    const { container } = render(
      <>
        <CanvasItemColorStyle />
        <ItemColorSwatches targets={worktree} onCustom={onCustom} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "보라" }));
    await userEvent.click(screen.getByRole("button", { name: "기본 색" }));
    expect(styleText(container)).toBe("");
    await userEvent.click(screen.getByRole("button", { name: /직접/ }));
    expect(onCustom).toHaveBeenCalled();
  });

  it("marks a swatch only when every selected card has it", async () => {
    window.localStorage.setItem("agent-control:canvas-item-colors", JSON.stringify(["card\tswatch\tblue\ts1"]));
    const both = [
      { scope: "card" as const, id: "s1" },
      { scope: "card" as const, id: "s2" },
    ];
    render(<ItemColorSwatches targets={both} onCustom={vi.fn()} />);
    expect(screen.getByRole("button", { name: "파랑" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "기본 색" }).getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(screen.getByRole("button", { name: "파랑" }));
    expect(screen.getByRole("button", { name: "파랑" }).getAttribute("aria-pressed")).toBe("true");
  });
});

