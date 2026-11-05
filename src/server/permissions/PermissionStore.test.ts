import { describe, expect, it } from "vitest";
import type { PermissionHookInput } from "@/common/permissions/schema";
import { PermissionStore, PRESENCE_MS } from "./PermissionStore";

function setup() {
  const clock = { now: 100_000 };
  const ids = { next: 0 };
  const store = new PermissionStore(
    () => clock.now,
    () => `id-${(ids.next += 1)}`,
  );
  return { store, clock };
}

function input(overrides: Partial<PermissionHookInput> = {}): PermissionHookInput {
  return {
    session_id: "s",
    transcript_path: "/t.jsonl",
    cwd: "/w",
    hook_event_name: "PermissionRequest",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    permission_suggestions: [
      { type: "addRules", rules: [{ toolName: "Bash" }], behavior: "allow", destination: "session" },
      { type: "bogus" },
    ],
    ...overrides,
  };
}

describe("PermissionStore", () => {
  it("knows whether the dashboard was seen recently", () => {
    const { store, clock } = setup();
    expect(store.isDashboardOpen()).toBe(false);
    store.markBoardSeen();
    clock.now += PRESENCE_MS - 1;
    expect(store.isDashboardOpen()).toBe(true);
    clock.now += 1;
    expect(store.isDashboardOpen()).toBe(false);
  });

  it("holds a request until it is answered, keeping only valid suggestions", async () => {
    const { store } = setup();
    const { request, result } = store.hold("pane", input());
    expect(request).toMatchObject({ id: "id-1", paneKey: "pane", receivedAt: 100_000, toolName: "Bash" });
    expect(request.suggestions).toHaveLength(1);
    expect(store.answer("id-1", { behavior: "allow", suggestionIndex: 0 })).toBe(true);
    expect(await result).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow", updatedPermissions: [request.suggestions[0]] },
      },
    });
    expect(store.answer("id-1", { behavior: "allow", suggestionIndex: null })).toBe(false);
  });

  it("denies with the message and rejects unknown suggestions", async () => {
    const { store } = setup();
    const { result } = store.hold("pane", input());
    expect(store.answer("id-1", { behavior: "allow", suggestionIndex: 5 })).toBe(false);
    expect(store.answer("id-1", { behavior: "deny", message: "no" })).toBe(true);
    expect((await result).hookSpecificOutput?.decision).toEqual({ behavior: "deny", message: "no" });
  });

  it("answers AskUserQuestion only with the asked questions", async () => {
    const { store } = setup();
    const toolInput = { questions: [{ question: "Q?", options: [{ label: "A" }] }] };
    const { result } = store.hold("pane", input({ tool_name: "AskUserQuestion", tool_input: toolInput }));
    expect(store.answer("id-1", { behavior: "answer", answers: { "Other?": "A" } })).toBe(false);
    expect(store.answer("id-1", { behavior: "answer", answers: { "Q?": "A" } })).toBe(true);
    expect((await result).hookSpecificOutput?.decision).toEqual({
      behavior: "allow",
      updatedInput: { ...toolInput, answers: { "Q?": "A" } },
    });
  });

  it("lists the newest request per pane, first one winning a tie", () => {
    const { store, clock } = setup();
    store.hold("a", input());
    store.hold("a", input());
    clock.now += 5;
    store.hold("b", input());
    const byPane = store.pendingByPane();
    expect(byPane.get("a")?.id).toBe("id-1");
    expect(byPane.get("b")?.id).toBe("id-3");
  });

  it("releases requests the agent moved past", async () => {
    const { store } = setup();
    const { result } = store.hold("pane", input());
    store.settleStale("pane", "waiting", 200_000);
    store.settleStale("pane", "working", null);
    store.settleStale("pane", "working", 50_000);
    expect(store.pendingByPane().size).toBe(1);
    store.settleStale("pane", "working", 200_000);
    expect(await result).toEqual({});
    expect(store.pendingByPane().size).toBe(0);
  });
});
