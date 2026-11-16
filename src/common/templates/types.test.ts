import { describe, expect, it } from "vitest";
import { routesFrom, runOf, templateOf, templatesOf } from "./types";

describe("templateOf", () => {
  it("fills defaults and drops broken routes and repeated keys", () => {
    const template = templateOf({
      id: "t1",
      name: " flow ",
      cards: [
        { key: "plan", title: "계획", prompt: "/flow", check: "  test -f ok  " },
        { key: "plan", title: "중복" },
        { key: "review", kind: "judge", continueFrom: true },
        { title: "키 없음" },
      ],
      routes: [
        { id: "r1", from: "plan", to: "review" },
        { id: "r2", from: "review", to: "plan", label: "고칠 것 있음" },
        { id: "r3", from: "review", to: "gone" },
        { id: "r4", from: "plan", to: "plan" },
      ],
    });
    expect(template?.name).toBe("flow");
    expect(template?.cards.map((card) => card.key)).toEqual(["plan", "review"]);
    expect(template?.cards[0]).toMatchObject({ kind: "work", check: "test -f ok", model: null, pauseAfter: false });
    expect(template?.cards[1]).toMatchObject({ kind: "judge", continueFrom: false, title: "review" });
    expect(template?.routes.map((route) => route.id)).toEqual(["r1", "r2"]);
    expect(routesFrom(template?.routes ?? [], "review")).toEqual([{ id: "r2", from: "review", to: "plan", label: "고칠 것 있음" }]);
  });

  it("rejects a template without cards", () => {
    expect(templateOf({ id: "t", cards: [] })).toBeNull();
    expect(templatesOf({ templates: [{ id: "t", cards: [{ key: "a" }] }, null] })).toHaveLength(1);
  });
});

describe("runOf", () => {
  it("reads a saved run and drops a current card that is not in it", () => {
    const run = runOf({
      id: "run1",
      templateId: "t1",
      name: "flow",
      cwd: "/repo",
      intent: "APP-1",
      cards: [{ key: "a" }],
      routes: [],
      state: "paused",
      current: "zzz",
      sessions: { a: "s1", b: 3 },
      hold: { reason: "trips", text: "멈춤" },
      trips: { r1: 2, r2: "x" },
    });
    expect(run).toMatchObject({ state: "paused", current: null, sessions: { a: "s1" }, trips: { r1: 2 }, hold: { reason: "trips" } });
    expect(runOf({ id: "x", state: "nope", cwd: "/", templateId: "t", cards: [{ key: "a" }] })).toBeNull();
  });
});
