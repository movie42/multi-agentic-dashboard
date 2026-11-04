import { defineConfig } from "@playwright/test";
import { E2E_PORT, prepareFixtures, serverEnv } from "./e2e/fixtures";

if (!process.env.E2E_FIXTURES_READY) {
  prepareFixtures();
  process.env.E2E_FIXTURES_READY = "1";
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${E2E_PORT}` },
  webServer: {
    command: `bunx next dev -H 127.0.0.1 -p ${E2E_PORT}`,
    url: `http://127.0.0.1:${E2E_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: serverEnv(),
  },
});
