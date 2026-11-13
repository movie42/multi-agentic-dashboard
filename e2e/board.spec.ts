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
  await page.locator("[data-model-picker]").first().click();
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

test("the card switches between chat and terminal", async ({ page }) => {
  await openAgent(page);
  await expect(page.locator("[data-chat]").first()).toBeVisible();
  await page.locator("[data-card-view=terminal]").first().click();
  await expect(page.locator("[data-chat]")).toHaveCount(0);
  await page.locator("[data-card-view=chat]").first().click();
  await expect(page.locator("[data-chat]").first()).toBeVisible();
});

test("a permission hook left installed gets an empty answer, so Claude asks in its own terminal", async ({ request }) => {
  const response = await request.post("/api/hooks/permission", {
    data: { hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "rm -rf dist" } },
  });
  expect(await response.json()).toEqual({});
});
