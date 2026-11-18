import { describe, expect, it } from "vitest";
import type { RunnerLaunchRequest, RunnerSession } from "../../src/common/runner/types.ts";
import { templateOf, type WorkflowTemplate } from "../../src/common/templates/types.ts";
import { TemplateRuns } from "./TemplateRuns.ts";

function session(id: string, cwd: string): RunnerSession {
  return {
    id,
    cwd,
    kind: "claude",
    status: "idle",
    interrupted: false,
    prompted: true,
    startedAt: 0,
    updatedAt: 0,
    exitCode: null,
    model: null,
    contextPercent: null,
    effort: null,
    permissionMode: null,
    conversationId: null,
    permission: null,
    orchestration: null,
  };
}

function setup(checkPasses = true) {
  const sessions = new Map<string, RunnerSession>();
  const launched: RunnerLaunchRequest[] = [];
  const delivered: Array<{ id: string; text: string }> = [];
  const state = { checkPasses, next: 0 };
  const runs = new TemplateRuns({
    get: (id) => sessions.get(id) ?? null,
    launch: (request) => {
      state.next += 1;
      const created = session(`s${state.next}`, request.cwd);
      sessions.set(created.id, created);
      launched.push(request);
      return created;
    },
    deliver: (id, text) => {
      delivered.push({ id, text });
      return true;
    },
    lastAnswer: (id) => `answer of ${id}`,
    check: async () => state.checkPasses,
    onChange: () => {},
    newId: () => "run1",
  });
  return { runs, sessions, launched, delivered, state };
}

const flow: WorkflowTemplate = templateOf({
  id: "t1",
  name: "flow",
  cards: [
    { key: "plan", title: "계획", prompt: "/flow 계획", check: "test -f approved" },
    { key: "build", title: "구현", prompt: "구현해", continueFrom: true },
    { key: "verify", title: "검증", prompt: "검증해", model: "sonnet", effort: "low" },
    { key: "review", title: "리뷰", prompt: "리뷰해", kind: "judge" },
    { key: "pr", title: "PR", prompt: "/git-pr", pauseAfter: true },
  ],
  routes: [
    { id: "r1", from: "plan", to: "build" },
    { id: "r2", from: "build", to: "verify" },
    { id: "r3", from: "verify", to: "review" },
    { id: "r4", from: "review", to: "pr", label: "통과" },
    { id: "r5", from: "review", to: "build", label: "고칠 것 있음" },
  ],
})!;

function expand(runs: TemplateRuns) {
  const result = runs.expand(flow, "/repo/wt", "APP-1 로그인");
  if (!result.ok) throw new Error(result.error);
  return result.run;
}

describe("TemplateRuns", () => {
  it("expands without sessions, then starts the first card with the work on top", () => {
    const { runs, launched } = setup();
    const run = expand(runs);
    expect(run.state).toBe("expanded");
    expect(launched).toHaveLength(0);
    expect(runs.expand(flow, "/repo/wt", "again").ok).toBe(false);
    runs.start(run.id);
    expect(launched[0]?.cwd).toBe("/repo/wt");
    expect(launched[0]?.prompt).toContain("이번 작업: APP-1 로그인");
    expect(launched[0]?.prompt).toContain("/flow 계획");
    expect(runs.list()[0]).toMatchObject({ state: "running", current: "plan", sessions: { plan: "s1" } });
  });

  it("holds a card on its check until it passes, then continues in the same session", async () => {
    const { runs, delivered, launched, state } = setup(false);
    runs.start(expand(runs).id);
    await runs.onStop("s1", "질문을 올렸어요");
    expect(runs.list()[0]).toMatchObject({ current: "plan", state: "running", hold: { reason: "check-failed" } });
    state.checkPasses = true;
    await runs.onStop("s1", "계획 승인됨");
    expect(runs.list()[0]?.current).toBe("build");
    expect(launched).toHaveLength(1);
    expect(delivered[0]?.id).toBe("s1");
    expect(delivered[0]?.text).toContain("계획 승인됨");
  });

  it("opens a new session with the card's model and effort, and a judge card with its route tool", async () => {
    const { runs, launched } = setup();
    runs.start(expand(runs).id);
    await runs.onStop("s1", "ok");
    await runs.onStop("s1", "built");
    expect(launched[1]).toMatchObject({ model: "sonnet", effort: "low" });
    await runs.onStop("s2", "verified");
    expect(launched[2]).toMatchObject({ judge: true });
    expect(launched[2]?.prompt).toContain("- 통과 → PR");
    expect(runs.isJudge("s3")).toBe(true);
    expect(runs.judgeRoutes("s3").map((route) => route.id)).toEqual(["r4", "r5"]);
  });

  it("pauses when a judge ends its turn without picking, and sends a loop back to the existing session", async () => {
    const { runs, delivered } = setup();
    const run = expand(runs);
    runs.start(run.id);
    await runs.onStop("s1", "ok");
    await runs.onStop("s1", "built");
    await runs.onStop("s2", "verified");
    await runs.onStop("s3", "음");
    expect(runs.list()[0]).toMatchObject({ state: "paused", hold: { reason: "no-choice" } });
    runs.retry(run.id, "길을 골라 줘");
    expect(runs.choose("s3", "고칠 것 있음", "테스트가 없어요").ok).toBe(true);
    await runs.onStop("s3", "리뷰 결과");
    const back = delivered.at(-1);
    expect(back?.id).toBe("s1");
    expect(back?.text).toContain("'고칠 것 있음' 길을 골랐어요. 이유: 테스트가 없어요");
    expect(back?.text).not.toContain("구현해");
    expect(runs.list()[0]).toMatchObject({ current: "build", trips: { r5: 1 } });
  });

  it("tells the next card that a person picked the route, without the judge's unsure answer", async () => {
    const { runs, launched } = setup();
    const run = expand(runs);
    runs.start(run.id);
    await runs.onStop("s1", "ok");
    await runs.onStop("s1", "built");
    await runs.onStop("s2", "verified");
    await runs.onStop("s3", "잘 모르겠어요");
    runs.continue(run.id, "r4");
    const prompt = launched.at(-1)?.prompt ?? "";
    expect(prompt).toContain("사람이 '리뷰' 카드 다음으로 '통과' 길을 골랐어요.");
    expect(prompt).not.toContain("카드가 '통과' 길을 골랐어요");
    expect(prompt).not.toContain("answer of s3");
  });

  it("stops after bouncing the same route MAX_TRIPS times until a person continues", async () => {
    const { runs } = setup();
    const run = expand(runs);
    runs.start(run.id);
    await runs.onStop("s1", "ok");
    const loop = async () => {
      await runs.onStop("s1", "built");
      await runs.onStop("s2", "verified");
      runs.choose("s3", "고칠 것 있음", "다시");
      await runs.onStop("s3", "fix");
    };
    await loop();
    await loop();
    expect(runs.list()[0]?.state).toBe("running");
    await loop();
    expect(runs.list()[0]).toMatchObject({ state: "paused", hold: { reason: "trips" }, current: "review" });
    runs.continue(run.id);
    expect(runs.list()[0]).toMatchObject({ state: "running", current: "build", trips: {} });
  });

  it("waits after a pause-after card and finishes when the last card is continued", async () => {
    const { runs } = setup();
    const run = expand(runs);
    runs.start(run.id);
    await runs.onStop("s1", "ok");
    await runs.onStop("s1", "built");
    await runs.onStop("s2", "verified");
    runs.choose("s3", "통과", "좋아요");
    await runs.onStop("s3", "pass");
    await runs.onStop("s4", "PR 초안");
    expect(runs.list()[0]).toMatchObject({ state: "paused", hold: { reason: "pause-after" }, current: "pr" });
    runs.continue(run.id);
    expect(runs.list()[0]).toMatchObject({ state: "done", current: null });
  });

  it("pauses a run whose current session closed and keys sessions by conversation on snapshot", () => {
    const { runs, sessions } = setup();
    runs.start(expand(runs).id);
    sessions.set("s1", { ...session("s1", "/repo/wt"), conversationId: "c1" });
    expect(runs.snapshot([...sessions.values()])[0]?.sessions).toEqual({ plan: "c1" });
    runs.prune(new Set());
    expect(runs.list()[0]).toMatchObject({ state: "paused", hold: { reason: "exited" } });
  });

  it("opens a new session for a continue-from card after a judge, and restores each session's launch options", async () => {
    const { runs, launched } = setup();
    const judged = templateOf({
      ...flow,
      cards: flow.cards.map((card) => (card.key === "pr" ? { ...card, continueFrom: true } : card)),
    })!;
    const result = runs.expand(judged, "/repo/other", "x");
    if (!result.ok) throw new Error(result.error);
    runs.start(result.run.id);
    await runs.onStop("s1", "ok");
    await runs.onStop("s1", "built");
    await runs.onStop("s2", "verified");
    runs.choose("s3", "통과", "좋아요");
    await runs.onStop("s3", "pass");
    expect(launched).toHaveLength(4);
    expect(runs.list()[0]?.sessions.pr).toBe("s4");
    expect(runs.launchOptionsOf("s2")).toEqual({ model: "sonnet", effort: "low" });
    expect(runs.launchOptionsOf("s3")).toEqual({ judge: true });
    expect(runs.launchOptionsOf("s1")).toEqual({});
  });

  it("starts the trip count over when a person sends a fix after the trip limit", async () => {
    const { runs } = setup();
    const run = expand(runs);
    runs.start(run.id);
    await runs.onStop("s1", "ok");
    const loop = async () => {
      await runs.onStop("s1", "built");
      await runs.onStop("s2", "verified");
      runs.choose("s3", "고칠 것 있음", "다시");
      await runs.onStop("s3", "fix");
    };
    await loop();
    await loop();
    await loop();
    expect(runs.list()[0]?.hold?.reason).toBe("trips");
    runs.retry(run.id, "이번엔 통과시켜도 돼");
    expect(runs.list()[0]).toMatchObject({ state: "running", trips: {} });
    expect(runs.list()[0]?.trips).toEqual({});
  });

  it("edits a running run: a next line with text hands that text over, and a card with a session cannot be removed", async () => {
    const { runs, launched, delivered } = setup();
    const run = expand(runs);
    runs.start(run.id);
    const routes = run.routes.map((route) => (route.id === "r2" ? { ...route, prompt: "검증 기준: 로그인만" } : route));
    expect(runs.edit(run.id, { name: run.name, cards: run.cards.filter((card) => card.key !== "plan"), routes }).ok).toBe(false);
    const edited = runs.edit(run.id, { name: run.name, cards: run.cards, routes });
    expect(edited.ok).toBe(true);
    await runs.onStop("s1", null);
    await runs.onStop("s1", "built");
    const verify = launched.at(-1)?.prompt ?? "";
    expect(verify).toContain("검증 기준: 로그인만");
    expect(verify).not.toContain("answer of");
    expect(delivered.length).toBeGreaterThan(0);
  });
});
