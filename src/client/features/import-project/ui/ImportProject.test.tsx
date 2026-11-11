import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportProject } from "./ImportProject";

function respond(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body)));
}

function renderImport() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportProject />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ImportProject", () => {
  it("imports the folder picked in the native dialog", async () => {
    const fetchMock = vi.fn((url: string) => respond(url === "/api/folder-picker" ? { ok: true, path: "/Users/me/app" } : { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderImport();
    await userEvent.click(screen.getByRole("button", { name: "+ 프로젝트 불러오기" }));
    await userEvent.click(screen.getByRole("button", { name: "폴더 선택" }));
    await waitFor(() => expect(screen.getByText(/Orca에 추가했어요/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/actions",
      expect.objectContaining({ body: JSON.stringify({ type: "import-project", path: "/Users/me/app" }) }),
    );
  });

  it("stays open without importing when the dialog is cancelled", async () => {
    const fetchMock = vi.fn(() => respond({ ok: true, path: null }));
    vi.stubGlobal("fetch", fetchMock);
    renderImport();
    await userEvent.click(screen.getByRole("button", { name: "+ 프로젝트 불러오기" }));
    await userEvent.click(screen.getByRole("button", { name: "폴더 선택" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "폴더 선택" })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the orca error for a typed path and keeps the form", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(() => respond({ ok: false, error: "이미 추가된 저장소" })));
    renderImport();
    await userEvent.click(screen.getByRole("button", { name: "+ 프로젝트 불러오기" }));
    await userEvent.type(screen.getByRole("textbox", { name: "프로젝트 경로" }), "/Users/me/app");
    await userEvent.click(screen.getByRole("button", { name: "불러오기" }));
    await waitFor(() => expect(screen.getByText("이미 추가된 저장소")).toBeTruthy());
  });
});
