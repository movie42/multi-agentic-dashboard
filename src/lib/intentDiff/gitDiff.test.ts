import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./gitDiff";

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@ export function a() {
 const one = 1;
-const two = 2;
+const two = 3;
+const three = 3;
 const four = 4;
@@ -10,2 +11,2 @@
-old
+new
 tail
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const x = 1;
+export const y = 2;
diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/gone.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const gone = true;
diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 100%
rename from src/old-name.ts
rename to src/new-name.ts
diff --git a/img.png b/img.png
index 5555555..6666666 100644
Binary files a/img.png and b/img.png differ
`;

describe("parseUnifiedDiff", () => {
  it("matches the current parse of a mixed diff", () => {
    expect(parseUnifiedDiff(DIFF)).toMatchSnapshot();
  });

  it("returns nothing for empty output", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});
