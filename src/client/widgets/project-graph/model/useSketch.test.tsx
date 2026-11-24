import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SketchItem } from "@/common/sketch/types";
import { useSketch } from "./useSketch";

const note = (id: string, text = id): SketchItem => ({ kind: "note", id, x: 0, y: 0, w: 100, h: 80, color: "yellow", text });
const respond = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));

describe("useSketch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads the canvas's drawing from the daemon", async () => {
    const fetchMock = vi.fn(() => respond({ ok: true, items: [note("a")] }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSketch("/repo"));
    await waitFor(() => expect(result.current.items).toEqual([note("a")]));
    expect(fetchMock).toHaveBeenCalledWith("/api/sketches?key=%2Frepo", expect.anything());
  });

  it("saves a change and steps it back and forth with undo and redo", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => respond({ ok: true, items: init?.body ? JSON.parse(String(init.body)).items : [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSketch("/repo"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => result.current.change((items) => [...items, note("a")]));
    expect(result.current.items).toEqual([note("a")]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/sketches", expect.objectContaining({ method: "PUT", body: JSON.stringify({ key: "/repo", items: [note("a")] }) })));

    act(() => result.current.undo());
    expect(result.current.items).toEqual([]);
    act(() => result.current.redo());
    expect(result.current.items).toEqual([note("a")]);
  });

  it("keeps two edits made before a re-render", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond({ ok: true, items: [] })));
    const { result } = renderHook(() => useSketch("/repo"));
    act(() => {
      result.current.change((items) => [...items, note("a")]);
      result.current.change((items) => [...items, note("b")]);
    });
    expect(result.current.items).toEqual([note("a"), note("b")]);
  });

  it("loads the next canvas even when the last one still had a save waiting", async () => {
    const fetchMock = vi.fn((url: string) => respond({ ok: true, items: url.includes("%2Fother") ? [note("z")] : [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ key }) => useSketch(key), { initialProps: { key: "/repo" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => result.current.change((items) => [...items, note("a")]));
    rerender({ key: "/other" });
    await waitFor(() => expect(result.current.items).toEqual([note("z")]));
  });

  it("does not let a reload drop an edit that is still waiting to save", async () => {
    const saves: Array<() => void> = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Promise<Response>((resolve) => saves.push(() => resolve(new Response(JSON.stringify({ ok: true, items: [] })))))
        : respond({ ok: true, items: [note("a")] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSketch("/repo"));
    await waitFor(() => expect(result.current.items).toEqual([note("a")]));

    act(() => result.current.change((items) => [...items, note("b")]));
    await waitFor(() => expect(saves.length).toBeGreaterThan(0));
    act(() => result.current.change((items) => [...items, note("c")]));
    await act(async () => {
      saves.forEach((finish) => finish());
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.items).toEqual([note("a"), note("b"), note("c")]);
  });
});
