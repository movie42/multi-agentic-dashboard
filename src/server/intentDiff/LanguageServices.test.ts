import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LanguageServices, lineOnDisk } from "./LanguageServices";

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "language-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true }, include: ["src"] }));
  await writeFile(path.join(root, "src", "a.ts"), "export function total(x: number) {\n  return x;\n}\n");
  await writeFile(path.join(root, "src", "b.ts"), 'import { total } from "./a";\nexport const y = total(1);\n');
  return root;
}

describe("lineOnDisk", () => {
  it("finds the shown line nearest to its old number", () => {
    expect(lineOnDisk(["a", "b", "a"], 3, "a")).toBe(3);
    expect(lineOnDisk(["a"], 1, "z")).toBeNull();
    expect(lineOnDisk(["a"], 2, null)).toBeNull();
  });
});

describe("LanguageServices", () => {
  it("finds definition and references, and picks up a file added later", async () => {
    const root = await project();
    const services = new LanguageServices();
    const lookup = services.lookup(root, "src/b.ts", 2, 17, null);
    expect(lookup.name).toBe("total");
    expect(lookup.definitions.map((location) => `${location.file}:${location.line}`)).toEqual(["src/a.ts:1"]);
    expect(lookup.references.map((location) => location.file)).toContain("src/b.ts");

    await writeFile(path.join(root, "src", "c.ts"), 'import { total } from "./a";\ntotal(2);\n');
    expect(services.lookup(root, "src/c.ts", 2, 0, null).definitions[0].file).toBe("src/a.ts");
  }, 30_000);

  it("throws for a file outside the project", async () => {
    const root = await project();
    expect(() => new LanguageServices().lookup(root, "missing.ts", 1, 0, null)).toThrow("TypeScript 프로젝트에 없는 파일이에요");
  }, 30_000);
});
