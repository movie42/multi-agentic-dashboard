import { expect, test } from "@playwright/test";
test("debug menu", async ({ page }) => {
  await page.goto("/");
  await page.locator("button[aria-expanded]", { hasText: "E2E 마지막 답변" }).click();
  const chat = page.locator("[data-chat]").first();
  await expect(chat.getByText("E2E 고정 프롬프트")).toBeVisible();
  await expect(chat.getByText("E2E 마지막 답변")).toBeVisible();
  await expect(page.locator("[data-context-percent]").first()).toHaveText("컨텍스트 34%");
  await page.evaluate(() => {
    const w = window as unknown as { __log: string[] };
    w.__log = [];
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.removedNodes) if (n instanceof HTMLElement && (n.matches("[role=menu]") || n.querySelector("[role=menu],[data-card]"))) w.__log.push("removed " + n.className.slice(0, 30) + " " + performance.now().toFixed(0) + " " + new Error().stack?.slice(0, 0));
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", (e) => w.__log.push("scroll " + String((e.target as HTMLElement).className ?? "doc").slice(0, 60) + " " + performance.now().toFixed(0)), true);
    window.addEventListener("mousedown", (e) => w.__log.push("mousedown " + String((e.target as HTMLElement).className).slice(0, 40) + " " + performance.now().toFixed(0)), true);
    window.addEventListener("resize", () => w.__log.push("resize"), true);
  });
  await page.locator("[data-model-picker]").first().click();
  await page.getByRole("menuitem", { name: "sonnet" }).click({ timeout: 3000 }).catch((e) => console.log("ERR", String(e).slice(0, 100)));
  console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { __log: string[] }).__log), null, 1));
});
