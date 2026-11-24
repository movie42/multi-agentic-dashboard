import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, BoardSnapshot } from "@/common/board/types";
import { postAction } from "@/client/shared/api/actions";
import { openWindow } from "@/client/shared/lib/openWindow";
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

function show(agentId: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true, board }), { headers: { "content-type": "application/json" } })),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionWindow agentId={agentId} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
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
});
