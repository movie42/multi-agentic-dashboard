import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const CLIENT_LAYERS = ["shared", "entities", "features", "widgets", "views"];
const SLICED = ["entities", "features", "widgets", "views"];

const deepSliceImport = {
  regex: "^@/client/(entities|features|widgets|views)/[^/]+/.+",
  message: "Import a slice through its public API (index.ts), not its internal files.",
};

function restrict(files, patterns) {
  return {
    files,
    rules: { "no-restricted-imports": ["error", { patterns }] },
  };
}

const clientBase = [
  { group: ["@/server", "@/server/*", "server-only"], message: "Client code cannot import server code; share types through @/common." },
  { group: ["node:*"], message: "Client code runs in the browser." },
  deepSliceImport,
];

const layerRules = CLIENT_LAYERS.map((layer, index) => {
  const higher = CLIENT_LAYERS.slice(index + 1).map((above) => `@/client/${above}`);
  const sameLayer = SLICED.includes(layer) ? [`@/client/${layer}/*`] : [];
  const forbidden = [...higher.flatMap((path) => [path, `${path}/*`]), ...sameLayer];
  return restrict(
    [`src/client/${layer}/**`],
    [
      ...clientBase,
      ...(forbidden.length > 0
        ? [{ group: forbidden, message: `FSD: "${layer}" may import only lower layers, and other slices of its own layer never.` }]
        : []),
    ],
  );
});

const mutableCollection =
  "VariableDeclarator:not([id.typeAnnotation.typeAnnotation.typeName.name=/^Readonly(Set|Map)$/]) > NewExpression[callee.name=/^(Map|Set|WeakMap|WeakSet)$/]";

const strictness = {
  files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
  rules: {
    "no-empty": ["error", { allowEmptyCatch: false }],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    "no-restricted-syntax": [
      "error",
      { selector: "VariableDeclaration[kind='let']", message: "Use const. A parser, stream buffer or position loop may keep let with a line-level disable and its reason." },
      ...["Program", "Program > ExportNamedDeclaration"].map((parent) => ({
        selector: `${parent} > VariableDeclaration > ${mutableCollection}`,
        message: "Module-level mutable collections are shared state; keep them in a class instance from services(), or type a lookup table as ReadonlySet/ReadonlyMap.",
      })),
    ],
  },
};

const testFiles = ["**/*.test.ts", "**/*.test.tsx", "test/**", "e2e/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  strictness,
  { files: testFiles, rules: { "@typescript-eslint/consistent-type-assertions": "off", "no-restricted-syntax": "off" } },
  restrict(["src/server/**"], [{ group: ["@/client", "@/client/*"], message: "Server code cannot import client code." }]),
  restrict(
    ["src/common/**"],
    [{ group: ["@/server", "@/server/*", "@/client", "@/client/*", "node:*", "server-only"], message: "@/common is shared by server and client and imports neither." }],
  ),
  ...layerRules,
  restrict(
    ["app/**", "proxy.ts"],
    [
      { group: ["@/server/*", "!@/server/container", "!@/server/security", "!@/server/security/*"], message: "app/ is the HTTP entry: call services() from @/server/container; move server internals behind a service method." },
      { group: ["@/client/*", "!@/client/views", "!@/client/views/*", "!@/client/shared", "!@/client/shared/ui", "!@/client/shared/ui/*"], message: "app/ assembles pages from @/client/views and app-wide pieces in @/client/shared/ui only." },
    ],
  ),
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "dist/**", "e2e/.tmp/**"]),
]);

export default eslintConfig;
