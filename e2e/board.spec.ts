import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CALLS, SESSION_ID } from "./fixtures";

interface RunnerCall {
  method: string;
  url: string;
  body: unknown;
}

function runnerCalls(): RunnerCall[] {
  return readFileSync(CALLS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunnerCall);
}

async function openAgent(page: Page) {
  await page.goto("/");
  await page.locator("button[aria-expanded]", { hasText: "E2E 마지막 답변" }).click();
}

test("board shows the session the runner daemon holds", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "내 차례 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: /e2e-repo \/ e2e-worktree E2E 마지막 답변/ })).toBeVisible();
});

test("quick reply sends the prompt to the agent's session", async ({ page }) => {
  await openAgent(page);
  const reply = page.locator("textarea[data-quick-reply]").first();
  await reply.fill("E2E 답장");
  await page.getByRole("button", { name: "보내기" }).first().click();
  await expect
    .poll(() => runnerCalls().find((call) => call.url.endsWith("/input")))
    .toEqual({ method: "POST", url: `/sessions/${SESSION_ID}/input`, body: { text: "E2E 답장", submit: true } });
});

test("the card shows the conversation as a chat with the session's model and context", async ({ page }) => {
  await openAgent(page);
  const chat = page.locator("[data-chat]").first();
  await expect(chat.getByText("E2E 고정 프롬프트")).toBeVisible();
  await expect(chat.getByText("E2E 마지막 답변")).toBeVisible();
  await expect(page.locator("[data-context-percent]").first()).toHaveText("컨텍스트 34%");
  const picker = page.locator("[data-model-picker]").first();
  await picker.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await picker.click();
  await page.getByRole("menuitem", { name: "sonnet" }).click();
  await expect
    .poll(() => runnerCalls().find((call) => JSON.stringify(call.body).includes("/model")))
    .toEqual({ method: "POST", url: `/sessions/${SESSION_ID}/input`, body: { text: "/model sonnet", submit: true } });
});

test("a held permission request is answered from the chat", async ({ page }) => {
  await openAgent(page);
  const prompt = page.locator("[data-permission-prompt]").first();
  await expect(prompt.getByText("Bash 실행 허락이 필요해요")).toBeVisible();
  await expect(prompt.getByText("rm -rf dist")).toBeVisible();
  await prompt.getByRole("button", { name: "허용" }).click();
  await expect
    .poll(() => runnerCalls().find((call) => call.url.endsWith("/permission")))
    .toEqual({
      method: "POST",
      url: `/sessions/${SESSION_ID}/permission`,
      body: { requestId: "p1", answer: { behavior: "allow", suggestionIndex: null } },
    });
});

test("the card switches between chat, terminal and the earlier conversation", async ({ page }) => {
  await openAgent(page);
  await expect(page.locator("[data-chat]").first()).toBeVisible();
  await page.locator("[data-card-view=terminal]").first().click();
  await expect(page.locator("[data-chat]")).toHaveCount(0);
  await page.locator("[data-card-view=chat]").first().click();
  await expect(page.locator("[data-chat]").first()).toBeVisible();
  await page.locator("[data-card-view=history]").first().click();
  const history = page.locator("[data-conversation-history]").first();
  await expect(history.locator("summary", { hasText: "E2E 고정 프롬프트" })).toBeVisible();
  await expect(page.locator("[data-permission-prompt]").first()).toBeVisible();
});

test("the project view shows a worktree's sessions as tabs and opens a shell from the worktree menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "이동 →" }).first().click();
  const tabs = page.locator("[data-session-tabs]").first();
  await expect(tabs.locator(`[data-session-tab="${SESSION_ID}"]`)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.locator("[data-chat]")).toBeVisible();
  await expect(page.locator("[data-sidebar-worktree][aria-current=page]")).toHaveCount(1);
  await tabs.locator("[data-new-session]").click();
  await expect
    .poll(() => runnerCalls().filter((call) => call.url === "/sessions" && call.method === "POST" && !JSON.stringify(call.body).includes("shell")).length)
    .toBe(1);
  await page.getByRole("button", { name: /워크트리 메뉴$/ }).first().click();
  await page.getByRole("menuitem", { name: /터미널/ }).click();
  await expect
    .poll(() => runnerCalls().find((call) => call.url === "/sessions" && JSON.stringify(call.body).includes("shell")))
    .toMatchObject({ method: "POST", body: { kind: "shell" } });
});

test("a permission hook left installed gets an empty answer, so Claude asks in its own terminal", async ({ request }) => {
  const response = await request.post("/api/hooks/permission", {
    data: { hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "rm -rf dist" } },
  });
  expect(await response.json()).toEqual({});
});
