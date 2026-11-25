import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postAction } from "@/client/shared/api/actions";
import { FileView } from "./FileView";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn(async () => undefined) }));

const FILE = "/tmp/fold-p2.png";

describe("FileView", () => {
  afterEach(() => vi.clearAllMocks());

  it("reveals the file in its folder", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Promise<Response>(() => undefined)));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FileView file={FILE} active root={null} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "폴더 열기" }));
    await waitFor(() => expect(postAction).toHaveBeenCalledWith({ type: "reveal-in-finder", target: FILE }));
    vi.unstubAllGlobals();
  });
});
