import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  outputFileTracingExcludes: {
    "*": ["./docs/**", "./src/**", "./scripts/**", "./desktop/**", "./daemon/**", "./e2e/**", "./dist/**", "./README.md", "./AGENTS.md"],
  },
  // The symbol lookup loads TypeScript's lib.*.d.ts files from disk, which tracing cannot see.
  outputFileTracingIncludes: {
    "/api/intent-diff/symbol": ["./node_modules/typescript/lib/*.d.ts"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
