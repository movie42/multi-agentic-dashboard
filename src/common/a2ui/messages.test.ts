import { describe, expect, it } from "vitest";
import { surfaceIdOf, validateUiMessages } from "./messages.ts";
import { CATALOG_ID } from "./catalog.ts";

const create = { version: "1.0", createSurface: { surfaceId: "pick", catalogId: CATALOG_ID } };
const components = (list: unknown[]) => ({ version: "1.0", updateComponents: { surfaceId: "pick", components: list } });

describe("validateUiMessages", () => {
  it("accepts a surface built from catalog components", () => {
    const messages = [
      create,
      components([
        { id: "root", component: "Column", children: ["title", "go"] },
        { id: "title", component: "Text", text: "어느 쪽으로 할까요?" },
        { id: "go", component: "Button", child: "goLabel", action: { event: { name: "pick", context: { choice: "a" } } } },
        { id: "goLabel", component: "Text", text: "A안" },
      ]),
    ];
    expect(validateUiMessages(messages)).toEqual({ ok: true, messages });
  });

  it("accepts the messages as a JSON string", () => {
    const messages = [create, components([{ id: "root", component: "Text", text: "안녕" }])];
    expect(validateUiMessages(JSON.stringify(messages))).toEqual({ ok: true, messages });
  });

  it("explains an unknown component so the agent can fix it", () => {
    const result = validateUiMessages([create, components([{ id: "root", component: "Bogus" }])]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Bogus");
  });

  it("rejects a dangling child reference", () => {
    const result = validateUiMessages([create, components([{ id: "root", component: "Column", children: ["missing"] }])]);
    expect(result.ok).toBe(false);
  });

  it("rejects messages without a createSurface for this catalog", () => {
    expect(validateUiMessages([components([{ id: "root", component: "Text", text: "x" }])]).ok).toBe(false);
    expect(validateUiMessages([]).ok).toBe(false);
    expect(validateUiMessages("not json").ok).toBe(false);
  });

  it("accepts the custom Option, Code and Table components", () => {
    const messages = [
      create,
      components([
        { id: "root", component: "Column", children: ["opt", "code", "table"] },
        { id: "opt", component: "Option", label: "A안", description: "빠름", preview: "a()", action: { event: { name: "pick" } } },
        { id: "code", component: "Code", text: "rm -rf build" },
        { id: "table", component: "Table", columns: ["이름", "값"], rows: [["a", "1"]] },
      ]),
    ];
    expect(validateUiMessages(messages).ok).toBe(true);
  });
});

describe("surfaceIdOf", () => {
  it("reads the created surface id", () => {
    expect(surfaceIdOf([create])).toBe("pick");
    expect(surfaceIdOf([])).toBeNull();
  });
});
