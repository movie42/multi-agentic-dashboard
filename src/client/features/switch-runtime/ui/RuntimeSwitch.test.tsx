import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "@/client/shared/model/toastStore";
import { RuntimeSwitch } from "./RuntimeSwitch";

function respond(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body)));
}

function renderSwitch() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <RuntimeSwitch />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  useToastStore.setState({ toasts: [] });
});

describe("RuntimeSwitch", () => {
  it("shows the polled mode and switches to the picked one", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => respond({ ok: true, mode: init?.method === "POST" ? "headless" : "app" }));
    vi.stubGlobal("fetch", fetchMock);
    renderSwitch();
    expect(screen.getByText("확인 중…")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "앱" }).getAttribute("aria-pressed")).toBe("true"));
    await userEvent.click(screen.getByRole("button", { name: "헤드리스" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "헤드리스" }).getAttribute("aria-pressed")).toBe("true"));
    expect(fetchMock).toHaveBeenCalledWith("/api/runtime", expect.objectContaining({ method: "POST", body: JSON.stringify({ mode: "headless" }) }));
  });

  it("toasts a failed switch and re-reads the current mode", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      respond(init?.method === "POST" ? { ok: false, error: "orca serve 실패" } : { ok: true, mode: "app" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderSwitch();
    await waitFor(() => expect(screen.getByRole("button", { name: "앱" }).getAttribute("aria-pressed")).toBe("true"));
    await userEvent.click(screen.getByRole("button", { name: "헤드리스" }));
    await waitFor(() => expect(useToastStore.getState().toasts).toEqual([expect.objectContaining({ message: "orca serve 실패" })]));
    await waitFor(() => expect(screen.getByRole("button", { name: "헤드리스" })).toHaveProperty("disabled", false));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method !== "POST")).toHaveLength(2);
  });
});
