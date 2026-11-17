import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorktreeSummary } from "@/common/board/types";
import { requestCommandManage, requestCommandRun, useCommandRequestStore } from "@/client/entities/project-commands";
import { ProjectCommandHost } from "./ProjectCommandHost";
import { WorktreeCommandButtons } from "./WorktreeCommandButtons";

const worktree: WorktreeSummary = {
  worktreeId: "wt-1",
  repo: "righter",
  name: "feat-a",
  branch: "feat/a",
  path: "/work/feat-a",
  projectPath: "/work/righter",
  isMain: false,
  parentWorktreeId: null,
  unread: false,
  lastActivityAt: 1,
  flowTasks: [],
  otherFlowTasks: [],
  pullRequest: { kind: "none" },
  jira: { kind: "not-applicable" },
  featureId: null,
};

type Handler = (url: string, init?: RequestInit) => unknown;

function serve(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => Response.json(handler(String(input), init)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(init?: RequestInit): unknown {
  return typeof init?.body === "string" ? JSON.parse(init.body) : null;
}

function renderHost(children: React.ReactNode = null) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
      <ProjectCommandHost />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useCommandRequestStore.getState().clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectCommandHost", () => {
  it("shows the branch and how far it is behind main before running a command", async () => {
    const fetchMock = serve((url) => {
      if (url.startsWith("/api/branch-status")) return { ok: true, status: { path: worktree.path, branch: "feat/a", commit: "b", mainCommit: "a", behind: 4 } };
      if (url === "/api/actions") return { ok: true };
      return { ok: true, projects: [] };
    });
    renderHost();
    act(() => requestCommandRun(worktree, { name: "빌드", command: "bun run build" }));
    expect(await screen.findByText("main보다 4커밋 뒤처져 있어요.")).toBeTruthy();
    expect(screen.getByText("bun run build")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "실행" }));
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/actions");
    expect(bodyOf(call?.[1])).toEqual({ type: "run-project-command", worktreePath: "/work/feat-a", projectPath: "/work/righter", name: "빌드" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lets the agent's proposals be unchecked and saves only the checked ones", async () => {
    const fetchMock = serve((url, init) => {
      const body = bodyOf(init);
      if (url === "/api/project-commands" && init?.method === "POST") {
        if (typeof body === "object" && body !== null && "type" in body && body.type === "propose") {
          return {
            ok: true,
            proposals: [
              { name: "빌드", command: "bun run build", why: "package.json scripts.build" },
              { name: "개발 모드", command: "bun run dev", why: "scripts.dev" },
            ],
          };
        }
        return { ok: true, projects: [{ projectPath: worktree.projectPath, commands: [{ name: "빌드", command: "bun run build" }] }] };
      }
      return { ok: true, projects: [] };
    });
    renderHost();
    act(() => requestCommandManage(worktree, "register"));
    expect(await screen.findByText("package.json scripts.build")).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: /개발 모드/ }));
    await userEvent.click(screen.getByRole("button", { name: "체크한 1개 저장" }));
    const save = fetchMock.mock.calls.map(([, init]) => bodyOf(init)).find((body) => typeof body === "object" && body !== null && "type" in body && body.type === "save");
    expect(save).toEqual({ type: "save", projectPath: "/work/righter", commands: [{ name: "빌드", command: "bun run build" }] });
  });

  it("sends a one-line edit request with the current commands and marks what changed", async () => {
    serve((url, init) => {
      const body = bodyOf(init);
      if (url === "/api/project-commands" && init?.method === "POST" && typeof body === "object" && body !== null && "type" in body && body.type === "revise") {
        return { ok: true, proposals: [{ name: "빌드", command: "bun run build --clean", why: "요청대로 바꿈" }] };
      }
      return { ok: true, projects: [{ projectPath: worktree.projectPath, commands: [{ name: "빌드", command: "bun run build" }, { name: "배포", command: "bun run deploy" }] }] };
    });
    renderHost(<WorktreeCommandButtons worktree={worktree} />);
    await userEvent.click(await screen.findByRole("button", { name: "명령 수정" }));
    await userEvent.type(screen.getByPlaceholderText("예: 재설치 명령에 캐시 지우기를 붙여 줘"), "빌드에 --clean 붙이고 배포는 빼 줘");
    await userEvent.click(screen.getByRole("button", { name: "고쳐 달라고 하기" }));
    expect(await screen.findByText("바뀜")).toBeTruthy();
    expect(screen.getByText(/저장하면 빠지는 명령/).textContent).toBe("저장하면 빠지는 명령: 배포");
  });

  it("offers registration on a project without commands", async () => {
    serve(() => ({ ok: true, projects: [] }));
    renderHost(<WorktreeCommandButtons worktree={worktree} />);
    expect(await screen.findByRole("button", { name: "+ 명령 등록" })).toBeTruthy();
  });
});
