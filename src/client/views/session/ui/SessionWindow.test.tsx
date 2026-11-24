import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, BoardSnapshot } from "@/common/board/types";
import { postAction } from "@/client/shared/api/actions";
import { openWindow } from "@/client/shared/lib/openWindow";
import { onSessionMessage, postSessionMessage, thisWindowId, type SessionWindowMessage } from "@/client/entities/agent";
import { useToastStore } from "@/client/shared/model/toastStore";
import { agentCard } from "../../../../../test/fixtures";
import { SessionWindow } from "./SessionWindow";

vi.mock("@/client/shared/lib/openWindow", () => ({ openWindow: vi.fn() }));
vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn(async () => {}) }));

interface CardStubProps {
  agent: AgentCard;
  onAction: (action: ActionRequest) => Promise<void>;
}

vi.mock("@/client/widgets/agent-card", () => ({
  AgentCardView: ({ agent, onAction }: CardStubProps) => (
    <div>
      <p>card {agent.id}</p>
      <button type="button" onClick={() => void onAction({ type: "open-artifact", target: "/repo/docs/a/index.html" })}>
        doc
      </button>
      <button type="button" onClick={() => void onAction({ type: "open-artifact", target: "/repo/src/a.ts" })}>
        file
      </button>
      <button type="button" onClick={() => void onAction({ type: "open-artifact", target: "https://example.com" })}>
        link
      </button>
    </div>
  ),
}));

let board: BoardSnapshot;

function show(agentIds: string | null | string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true, board }), { headers: { "content-type": "application/json" } })),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionWindow agentIds={agentIds === null ? [] : typeof agentIds === "string" ? [agentIds] : agentIds} />
    </QueryClientProvider>,
  );
}

let stopListening: (() => void) | null = null;
let heard: SessionWindowMessage[] = [];
/** Stands in for the other windows: hears what this one posts and posts as they would. */
function listen() {
  heard = [];
  stopListening = onSessionMessage((message) => heard.push(message));
  return { postMessage: postSessionMessage };
}

afterEach(() => {
  stopListening?.();
  stopListening = null;
  useToastStore.setState({ toasts: [] });
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  document.title = "";
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

const session = agentCard({ id: "s1", worktreeName: "wt-a", session: { id: "s1", title: "환불 고치기", titleSource: "ai", bookmark: null } });

describe("SessionWindow", () => {
  it("draws the one session it was opened for and names the window after it", async () => {
    board = { fetchedAt: 0, projects: [], worktrees: [], agents: [agentCard({ id: "other" }), session], features: [] };
    show("s1");
    expect(await screen.findByText("card s1")).toBeTruthy();
    expect(screen.queryByText("card other")).toBeNull();
    expect(document.title).toBe("환불 고치기 · wt-a · Agent Control");
  });

  it("falls back past an empty title", async () => {
    board = { fetchedAt: 0, projects: [], worktrees: [], agents: [agentCard({ id: "s1", worktreeName: "wt-a", title: "", prompt: "  " })], features: [] };
    show("s1");
    await screen.findByText("card s1");
    expect(document.title).toBe("세션 · wt-a · Agent Control");
  });

  it("says so when the session is gone from the board", async () => {
    board = { fetchedAt: 0, projects: [], worktrees: [], agents: [], features: [] };
    show("s1");
    expect(await screen.findByText(/이 세션은 끝났거나/)).toBeTruthy();
  });

  it("opens documents and files in their own window and sends anything else to the server", async () => {
    board = { fetchedAt: 0, projects: [], worktrees: [], agents: [session], features: [] };
    show("s1");
    await userEvent.click(await screen.findByRole("button", { name: "doc" }));
    expect(vi.mocked(openWindow)).toHaveBeenLastCalledWith("/doc?path=%2Frepo%2Fdocs%2Fa%2Findex.html", expect.anything());
    await userEvent.click(screen.getByRole("button", { name: "file" }));
    expect(vi.mocked(openWindow)).toHaveBeenLastCalledWith("/doc?file=%2Frepo%2Fsrc%2Fa.ts", expect.anything());
    await userEvent.click(screen.getByRole("button", { name: "link" }));
    expect(vi.mocked(postAction)).toHaveBeenCalledWith({ type: "open-artifact", target: "https://example.com" });
  });

  it("paints the prompt colours picked in the main window", async () => {
    localStorage.setItem("agent-control:prompt-colors", JSON.stringify(["#112233", "#445566"]));
    board = { fetchedAt: 0, projects: [], worktrees: [], agents: [session], features: [] };
    show("s1");
    await screen.findByText("card s1");
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--prompt-custom")).toBe("#112233");
    expect(root.getPropertyValue("--prompt-ink-custom")).toBe("#445566");
  });

  const two = () => {
    board = { fetchedAt: 0, projects: [], worktrees: [], agents: [session, agentCard({ id: "s2", worktreeName: "wt-b", title: "로그인 버그" })], features: [] };
  };
  const visible = (text: string) => !screen.getByText(text).closest("[data-tab-panel]")?.className.includes("invisible");
  const sessionDrop = (from: string, agentId: string) => ({
    dataTransfer: {
      types: ["application/x-agent-control-session", `application/x-agent-control-from-${from}`],
      getData: (type: string) => (type === "application/x-agent-control-session" ? agentId : ""),
      dropEffect: "none",
    },
  });

  it("holds several sessions as tabs and names the window after the one in front", async () => {
    two();
    show(["s1", "s2"]);
    expect(await screen.findByText("card s1")).toBeTruthy();
    expect(visible("card s1")).toBe(true);
    expect(visible("card s2")).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: /로그인 버그/ }));
    expect(visible("card s2")).toBe(true);
    expect(document.title).toBe("로그인 버그 · wt-b · Agent Control");
    expect(window.location.search).toBe("?id=s1&id=s2");
  });

  it("closes the window when its last tab closes", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    two();
    show(["s1", "s2"]);
    await screen.findByText("card s1");
    fireEvent.click(screen.getByRole("button", { name: "환불 고치기 닫기" }));
    expect(screen.queryByText("card s1")).toBeNull();
    expect(window.location.search).toBe("?id=s2");
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "로그인 버그 닫기" }));
    expect(close).toHaveBeenCalled();
  });

  it("takes a session tab dropped from another window and tells that window to let it go", async () => {
    two();
    show("s1");
    await screen.findByText("card s1");
    listen();
    const strip = screen.getByRole("tablist");
    fireEvent.dragOver(strip, sessionDrop("w-other", "s2"));
    fireEvent.drop(strip, sessionDrop("w-other", "s2"));
    expect(await screen.findByText("card s2")).toBeTruthy();
    expect(visible("card s2")).toBe(true);
    await waitFor(() => expect(heard).toContainEqual({ type: "taken", agentId: "s2", by: thisWindowId() }));
  });

  it("refuses a tab dragged from its own strip", async () => {
    two();
    show(["s1", "s2"]);
    await screen.findByText("card s1");
    const strip = screen.getByRole("tablist");
    fireEvent.drop(strip, sessionDrop(thisWindowId(), "s2"));
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("lets a tab go once another window has taken it", async () => {
    two();
    show(["s1", "s2"]);
    await screen.findByText("card s2");
    listen().postMessage({ type: "taken", agentId: "s2", by: "w-other" });
    await waitFor(() => expect(screen.queryByText("card s2")).toBeNull());
  });

  it("sends the tab in front to the main window, and keeps it when no main window answers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    two();
    show(["s1", "s2"]);
    await vi.waitFor(() => screen.getByText("card s1"));
    listen();
    fireEvent.click(screen.getByRole("button", { name: "메인 창으로" }));
    await vi.waitFor(() => expect(heard).toContainEqual({ type: "dock", agentId: "s1", from: thisWindowId() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(screen.getByText("card s1")).toBeTruthy();
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/메인 창/);
    vi.useRealTimers();
  });

  it("gathers every other session window into this one", async () => {
    two();
    show("s1");
    await screen.findByText("card s1");
    const channel = listen();
    fireEvent.click(screen.getByRole("button", { name: "세션 창 모두 합치기" }));
    await waitFor(() => expect(heard).toContainEqual({ type: "merge-into", target: thisWindowId() }));
    channel.postMessage({ type: "hand-over", target: thisWindowId(), agentIds: ["s2"] });
    expect(await screen.findByText("card s2")).toBeTruthy();
  });

  it("hands its tabs over and closes when another window gathers them", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    two();
    show(["s1", "s2"]);
    await screen.findByText("card s1");
    listen().postMessage({ type: "merge-into", target: "w-other" });
    await waitFor(() => expect(heard).toContainEqual({ type: "hand-over", target: "w-other", agentIds: ["s1", "s2"] }));
    expect(close).toHaveBeenCalled();
    expect(screen.getByText(/탭을 모두 다른 창으로 옮겼어요/)).toBeTruthy();
  });

  it("brings a tab forward when its session is opened again from elsewhere", async () => {
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {});
    two();
    show(["s1", "s2"]);
    await screen.findByText("card s1");
    listen().postMessage({ type: "focus", agentId: "s2" });
    await waitFor(() => expect(visible("card s2")).toBe(true));
    expect(focus).toHaveBeenCalled();
  });

  it("takes over the entry its opener kept under the window's name while it loaded", async () => {
    window.name = "session-window:w-new";
    localStorage.setItem("agent-control:session-windows", JSON.stringify({ "session-window:w-new": { agentIds: ["s1"], seen: Date.now() } }));
    two();
    show("s1");
    await screen.findByText("card s1");
    const registry = JSON.parse(localStorage.getItem("agent-control:session-windows")!);
    expect(Object.keys(registry)).toEqual([thisWindowId()]);
    window.name = "";
  });
});
