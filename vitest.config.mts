import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  "server-only": path.resolve(import.meta.dirname, "test/stubs/server-only.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    restoreMocks: true,
    projects: [
      {
        resolve: { alias },
        test: { name: "node", environment: "node", include: ["src/**/*.test.ts", "test/**/*.test.ts"], restoreMocks: true },
      },
      {
        resolve: { alias },
        test: { name: "contract", environment: "node", include: ["test/contract/**/*.contract.ts"], restoreMocks: true },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["test/setup-dom.ts"],
          restoreMocks: true,
        },
      },
    ],
  },
});
