import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CALLS, PANE_KEY, TERMINAL } from "./fixtures";

function orcaCalls(): string[][] {
  return readFileSync(CALLS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

async function openAgent(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /E2E 마지막 답변/ }).click();
}

test("board shows the agent from orca", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "내 차례 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: /e2e-repo \/ e2e-worktree E2E 마지막 답변/ })).toBeVisible();
});

test("quick reply sends the prompt to the agent's terminal", async ({ page }) => {
  await openAgent(page);
  const reply = page.locator("textarea[data-quick-reply]").first();
  await reply.fill("E2E 답장");
  await page.getByRole("button", { name: "보내기" }).first().click();
  await expect
    .poll(() => orcaCalls().find((args) => args[0] === "terminal" && args[1] === "send"))
    .toEqual(["terminal", "send", "--terminal", TERMINAL, "--text", "E2E 답장", "--enter", "--wait-submit", "3"]);
});

test("permission request is answered from the board", async ({ page, request }) => {
  await openAgent(page);
  const hook = request.post("/api/hooks/permission", {
    headers: { "x-orca-pane": PANE_KEY },
    data: {
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "rm -rf dist" },
      session_id: "e2e-session",
      transcript_path: "",
      permission_suggestions: [],
    },
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "허용", exact: true }).click();
  const response = await hook;
  expect(await response.json()).toMatchObject({ hookSpecificOutput: { decision: { behavior: "allow" } } });
});
