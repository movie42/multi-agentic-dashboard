import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  "server-only": path.resolve(import.meta.dirname, "test/stubs/server-only.ts"),
};

const env = { AGENT_CONTROL_LOG_FILE: path.join(os.tmpdir(), "agent-control-vitest", "app.log") };

export default defineConfig({
  resolve: { alias },
  test: {
    restoreMocks: true,
    projects: [
      {
        resolve: { alias },
        test: { name: "node", environment: "node", include: ["src/**/*.test.ts", "test/**/*.test.ts"], restoreMocks: true, env },
      },
      {
        resolve: { alias },
        test: { name: "contract", environment: "node", include: ["test/contract/**/*.contract.ts"], restoreMocks: true, env },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["test/setup-dom.ts"],
          restoreMocks: true,
          env,
        },
      },
    ],
  },
});
