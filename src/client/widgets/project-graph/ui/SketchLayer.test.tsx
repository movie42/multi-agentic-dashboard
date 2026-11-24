import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SketchItem } from "@/common/sketch/types";
import type { Sketch } from "../model/useSketch";
import { SketchCapture, type SketchFrames, SketchItems, useSketchTools, type SketchTool } from "./SketchLayer";

interface HarnessProps {
  tool: SketchTool | "select";
  initial?: SketchItem[];
  onDone?: () => void;
  onItems?: (items: SketchItem[]) => void;
  frames?: SketchFrames;
}

function Harness({ tool, initial = [], onDone = () => undefined, onItems, frames }: HarnessProps) {
  const [items, setItems] = useState(initial);
  const sketch: Sketch = {
    items,
    change: (edit) =>
      setItems((current) => {
        const next = edit(current);
        onItems?.(next);
        return next;
      }),
    undo: () => undefined,
    redo: () => undefined,
  };
  const ui = useSketchTools({ sketch, tool, zoom: 1, passive: false, toWorld: (x, y) => ({ x, y }), onDone, frames, newId: () => "new" });
  return (
    <svg>
      <SketchItems ui={ui} />
      {tool !== "select" && <SketchCapture ui={ui} />}
    </svg>
  );
}

const note: SketchItem = { kind: "note", id: "n1", x: 0, y: 0, w: 200, h: 160, color: "yellow", text: "할 일" };

describe("SketchLayer", () => {
  it("drops a memo where the memo tool clicks, opens it for typing and goes back to the pointer", () => {
    const onDone = vi.fn();
    const onItems = vi.fn();
    const { container } = render(<Harness tool="note" onDone={onDone} onItems={onItems} />);
    const capture = container.querySelector("[data-sketch-capture]")!;
    fireEvent.pointerDown(capture, { button: 0, clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(capture, { button: 0, clientX: 40, clientY: 50, pointerId: 1 });
    expect(onItems).toHaveBeenLastCalledWith([expect.objectContaining({ kind: "note", id: "new", x: 40, y: 50, text: "" })]);
    expect(onDone).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "메모 내용" }));
  });

  it("draws a box the size of the drag", () => {
    const onItems = vi.fn();
    const { container } = render(<Harness tool="rect" onItems={onItems} />);
    const capture = container.querySelector("[data-sketch-capture]")!;
    fireEvent.pointerDown(capture, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(capture, { clientX: 60, clientY: 180, pointerId: 1 });
    fireEvent.pointerUp(capture, { clientX: 60, clientY: 180, pointerId: 1 });
    expect(onItems).toHaveBeenLastCalledWith([expect.objectContaining({ kind: "rect", x: 60, y: 100, w: 40, h: 80 })]);
  });

  it("draws a pen stroke through the points it passed", () => {
    const onItems = vi.fn();
    const { container } = render(<Harness tool="pen" onItems={onItems} />);
    const capture = container.querySelector("[data-sketch-capture]")!;
    fireEvent.pointerDown(capture, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(capture, { clientX: 20, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(capture, { clientX: 20, clientY: 20, pointerId: 1 });
    expect(onItems).toHaveBeenLastCalledWith([expect.objectContaining({ kind: "pen", points: [[0, 0], [20, 0], [20, 20]] })]);
  });

  it("selects a memo with a click, and Delete removes it", () => {
    const onItems = vi.fn();
    const { container } = render(<Harness tool="select" initial={[note]} onItems={onItems} />);
    const item = container.querySelector("[data-sketch='n1']")!;
    fireEvent.pointerDown(item, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(item, { clientX: 10, clientY: 10, pointerId: 1 });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    });
    expect(onItems).toHaveBeenLastCalledWith([]);
  });

  it("moves a memo by dragging it", () => {
    const onItems = vi.fn();
    const { container } = render(<Harness tool="select" initial={[note]} onItems={onItems} />);
    const item = container.querySelector("[data-sketch='n1']")!;
    fireEvent.pointerDown(item, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(item, { clientX: 40, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(item, { clientX: 40, clientY: 30, pointerId: 1 });
    expect(onItems).toHaveBeenLastCalledWith([expect.objectContaining({ id: "n1", x: 30, y: 20 })]);
  });

  it("edits a memo's text on double-click", () => {
    const onItems = vi.fn();
    const { container } = render(<Harness tool="select" initial={[note]} onItems={onItems} />);
    fireEvent.doubleClick(container.querySelector("[data-sketch='n1']")!);
    const box = screen.getByRole("textbox", { name: "메모 내용" });
    fireEvent.change(box, { target: { value: "나중에 볼 일" } });
    fireEvent.blur(box);
    expect(onItems).toHaveBeenLastCalledWith([expect.objectContaining({ id: "n1", text: "나중에 볼 일" })]);
  });

  it("resizes a selected memo from its corner handle", () => {
    const onItems = vi.fn();
    const { container } = render(<Harness tool="select" initial={[note]} onItems={onItems} />);
    const item = container.querySelector("[data-sketch='n1']")!;
    fireEvent.pointerDown(item, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(item, { clientX: 10, clientY: 10, pointerId: 1 });
    const handle = screen.getByLabelText("크기 조절");
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 160, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 320, clientY: 280, pointerId: 1 });
    expect(onItems).toHaveBeenLastCalledWith([expect.objectContaining({ id: "n1", w: 320, h: 280 })]);
  });

  it("joins the worktree frame it is dropped in and moves when that frame moves", () => {
    const onItems = vi.fn();
    const frame = (x: number): SketchFrames => ({
      origins: new Map([["wt:a", { x, y: 0 }]]),
      frameAt: (point) => (point.x >= x && point.x <= x + 500 ? "wt:a" : undefined),
    });
    const { container, rerender } = render(<Harness tool="select" initial={[note]} onItems={onItems} frames={frame(300)} />);
    const item = container.querySelector("[data-sketch='n1']")!;
    fireEvent.pointerDown(item, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(item, { clientX: 410, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(item, { clientX: 410, clientY: 10, pointerId: 1 });
    expect(onItems).toHaveBeenLastCalledWith([expect.objectContaining({ x: 400, parent: { id: "wt:a", x: 300, y: 0 } })]);

    rerender(<Harness tool="select" initial={[note]} onItems={onItems} frames={frame(350)} />);
    expect(container.querySelector("[data-sketch='n1'] rect")?.getAttribute("x")).toBe("450");
  });

  it("leaves its frame when dragged out of it", () => {
    const onItems = vi.fn();
    const frames: SketchFrames = { origins: new Map([["wt:a", { x: 0, y: 0 }]]), frameAt: (point) => (point.x < 500 ? "wt:a" : undefined) };
    const inFrame: SketchItem = { ...note, parent: { id: "wt:a", x: 0, y: 0 } };
    const { container } = render(<Harness tool="select" initial={[inFrame]} onItems={onItems} frames={frames} />);
    const item = container.querySelector("[data-sketch='n1']")!;
    fireEvent.pointerDown(item, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(item, { clientX: 810, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(item, { clientX: 810, clientY: 10, pointerId: 1 });
    expect(onItems.mock.lastCall?.[0][0]).not.toHaveProperty("parent");
  });

  it("links the selected words when a URL is pasted over them, and shows the link outside editing", () => {
    const onItems = vi.fn();
    const { container } = render(<Harness tool="select" initial={[{ ...note, text: "리뷰 답장" }]} onItems={onItems} />);
    fireEvent.doubleClick(container.querySelector("[data-sketch='n1']")!);
    const box = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "메모 내용" });
    box.setSelectionRange(3, 5);
    fireEvent.paste(box, { clipboardData: { getData: () => "https://github.com/x/pull/1" } });
    fireEvent.blur(box);
    expect(onItems).toHaveBeenLastCalledWith([expect.objectContaining({ text: "리뷰 [답장](https://github.com/x/pull/1)" })]);
    expect(screen.getByRole("link", { name: "답장" }).getAttribute("href")).toBe("https://github.com/x/pull/1");
  });
});
