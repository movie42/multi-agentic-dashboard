import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { attribute, mergeSnapshots } from "./attribute";
import { parseUnifiedDiff } from "./gitDiff";
import type { LoadedPlan } from "./plan";
import { parseTranscript } from "./parseTranscript";

const raw = readFileSync(path.join(import.meta.dirname, "../../../test/fixtures/transcript.jsonl"), "utf8");

const DIFF = `diff --git a/src/Button.tsx b/src/Button.tsx
index 1..2 100644
--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,2 +1,2 @@
 ctx
-color: red
+color: primary
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const a = 1;
+export const b = 2;
diff --git a/src/x.ts b/src/x.ts
index 1..2 100644
--- a/src/x.ts
+++ b/src/x.ts
@@ -1 +1 @@
-const a = 1;
+const b = 1;
diff --git a/src/imports.ts b/src/imports.ts
index 1..2 100644
--- a/src/imports.ts
+++ b/src/imports.ts
@@ -1 +1,2 @@
 import { a } from "./a";
+import { b } from "./b";
diff --git a/src/orphan.ts b/src/orphan.ts
index 1..2 100644
--- a/src/orphan.ts
+++ b/src/orphan.ts
@@ -1 +1 @@
-nobody wrote this
+nobody wrote that
diff --git a/bun.lock b/bun.lock
index 1..2 100644
--- a/bun.lock
+++ b/bun.lock
@@ -1 +1 @@
-x
+y
`;

const files = parseUnifiedDiff(DIFF);
const ranks = new Map<string, number>();

describe("attribute", () => {
  it("matches the current grouping without a plan", () => {
    expect(attribute(files, parseTranscript(raw, ["/repo"], true), null, new Map(), ranks)).toMatchSnapshot();
  });

  it("matches the current grouping with a plan", () => {
    const plan: LoadedPlan = {
      taskKey: "domain/task",
      title: "Task",
      taskFile: "docs/domain/tasks/task.json",
      phases: [
        {
          id: "P1",
          title: "Phase 1",
          items: [
            { id: "P1-1", title: "Button", done: true, files: ["src/Button.tsx"] },
            { id: "P1-2", title: "New module", done: true, files: ["src/new.ts"] },
            { id: "P1-3", title: "Untouched", done: false, files: ["src/never.ts"] },
          ],
        },
      ],
    };
    const completions = new Map([
      ["P1-1", Date.parse("2026-11-04T10:00:03.500Z")],
      ["P1-2", Date.parse("2026-11-04T10:00:30.000Z")],
    ]);
    expect(attribute(files, parseTranscript(raw, ["/repo"], true), plan, completions, ranks)).toMatchSnapshot();
  });
});

describe("mergeSnapshots", () => {
  it("replaces the matching call's changes and appends unmatched snapshots", () => {
    const events = parseTranscript(raw, ["/repo"], true);
    const changes = { "src/x.ts": { added: ["const b = 1;"], removed: ["const a = 1;"], precision: "exact" as const } };
    const merged = mergeSnapshots(events, [
      { record: { at: 1, toolUseId: "t-bash", sessionId: "sess-1", tool: "Bash", tree: "t1" }, previousTree: "t0", changes, worktreePath: "/repo" },
      { record: { at: 2, toolUseId: null, sessionId: null, tool: "Bash", tree: "t2" }, previousTree: "t1", changes, worktreePath: "/repo" },
    ]);
    expect(merged.find((event) => event.id === "t-bash")?.changes).toEqual(changes);
    expect(merged[0]).toMatchObject({ id: "snapshot:2", segmentId: "snapshot:unknown" });
  });
});
