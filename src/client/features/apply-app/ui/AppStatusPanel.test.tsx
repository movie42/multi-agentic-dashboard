import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppStatus } from "@/common/appStatus/types";
import { AppStatusPanel } from "./AppStatusPanel";

const fresh: AppStatus = {
  repoPath: "/repo",
  checkout: { path: "/repo", branch: "main", commit: "aaaaaaa1", mainCommit: "aaaaaaa1", behind: 0 },
  app: { kind: "built", commit: "aaaaaaa1", branch: "main", builtAt: 1, installedCommit: null },
  daemon: { kind: "running", commit: "aaaaaaa1", startedAt: 1 },
  workingSessions: 0,
  restart: { kind: "idle" },
  build: { kind: "none" },
};

function serve(status: AppStatus, after: AppStatus = status) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    Response.json({ ok: true, status: init?.method === "POST" ? after : status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPanel() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppStatusPanel />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppStatusPanel", () => {
  it("shows only 최신 while the app, the daemon and main agree", async () => {
    serve(fresh);
    renderPanel();
    expect(await screen.findByText("최신")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "앱 빌드 · 재설치" })).toBeNull();
  });

  it("opens with the buttons when the installed app is behind main, and confirms the branch before building", async () => {
    const fetchMock = serve({
      ...fresh,
      checkout: { ...fresh.checkout, branch: "feat/x", behind: 2 },
      app: { kind: "built", commit: "bbbbbbb2", branch: "feat/x", builtAt: 1, installedCommit: null },
    });
    renderPanel();
    expect(await screen.findByText("코드가 어긋나요")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "앱 빌드 · 재설치" }));
    expect(screen.getByText("main보다 2커밋 뒤처져 있어요.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "빌드 · 재설치" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/app-status", expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "build-app" }) }));
    expect(await screen.findByText(/빌드를 시작했어요/)).toBeTruthy();
  });

  it("offers to wait for working sessions before restarting the daemon, and lets the wait be cancelled", async () => {
    const stale: AppStatus = { ...fresh, daemon: { kind: "running", commit: null, startedAt: null }, workingSessions: 2 };
    const fetchMock = serve(stale, { ...stale, restart: { kind: "scheduled", requestedAt: 1 } });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "데몬 재시작" }));
    expect(screen.getByText("2개")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "다 끝나면 재시작" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/app-status", expect.objectContaining({ body: JSON.stringify({ type: "restart-daemon", when: "idle" }) }));
    expect(await screen.findByText("작업 중인 세션 2개가 끝나면 데몬을 재시작해요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "예약 취소" })).toBeTruthy();
  });
});
