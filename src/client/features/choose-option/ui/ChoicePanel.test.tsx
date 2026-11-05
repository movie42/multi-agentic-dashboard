import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "@/client/shared/model/toastStore";
import { ChoicePanel } from "./ChoicePanel";

const screenBody = {
  ok: true,
  screen: { choice: { context: [], question: "계속할까요?", options: [{ number: 1, label: "예" }] } },
};

function renderPanel() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ChoicePanel terminalHandle="term-1" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  useToastStore.setState({ toasts: [] });
});

describe("ChoicePanel", () => {
  it("shows a failed terminal read in the panel status line", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: false, error: "터미널 없음" })))));
    renderPanel();
    expect((await screen.findByRole("status")).textContent).toBe("터미널 화면을 읽지 못했어요터미널 없음");
  });

  it("toasts a failed choice and lets the user pick again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(new Response(JSON.stringify(url === "/api/actions" ? { ok: false, error: "보내기 실패" } : screenBody))),
      ),
    );
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /예/ }));
    expect(useToastStore.getState().toasts).toEqual([expect.objectContaining({ tone: "error", message: "보내기 실패" })]);
    expect(screen.getByRole("button", { name: /예/ })).toHaveProperty("disabled", false);
  });
});
