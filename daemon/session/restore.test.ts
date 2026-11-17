import { describe, expect, it } from "vitest";
import type { RunnerSession } from "../../src/common/runner/types.ts";
import { parseSavedSessions, restoreRequestsOf, savedSessionsOf } from "./restore.ts";

function session(overrides: Partial<RunnerSession>): RunnerSession {
  return {
    id: "s1",
    cwd: "/repo",
    kind: "claude",
    status: "idle",
    interrupted: false,
    prompted: true,
    startedAt: 10,
    updatedAt: 10,
    exitCode: null,
    model: null,
    contextPercent: null,
    effort: null,
    conversationId: null,
    permission: null,
    orchestration: null,
    ...overrides,
  };
}

describe("restore", () => {
  it("saves the live sessions oldest first and leaves out the ones that ended", () => {
    expect(
      savedSessionsOf([
        session({ id: "b", startedAt: 20, kind: "shell", prompted: false }),
        session({ id: "gone", status: "exited" }),
        session({ id: "a", startedAt: 5, status: "working" }),
      ]),
    ).toEqual([
      { id: "a", cwd: "/repo", kind: "claude", prompted: true, startedAt: 5 },
      { id: "b", cwd: "/repo", kind: "shell", prompted: false, startedAt: 20 },
    ]);
  });

  it("reads back only well-formed entries", () => {
    expect(
      parseSavedSessions({
        sessions: [
          { id: "a", cwd: "/repo", kind: "claude", prompted: true, startedAt: 5 },
          { id: "b", cwd: "relative", kind: "claude", prompted: true, startedAt: 5 },
          { id: "c", cwd: "/repo", kind: "other", prompted: true, startedAt: 5 },
          { id: "d", cwd: "/repo", kind: "shell", prompted: "no", startedAt: 5 },
          3,
        ],
      }),
    ).toEqual([{ id: "a", cwd: "/repo", kind: "claude", prompted: true, startedAt: 5 }]);
    expect(parseSavedSessions(null)).toEqual([]);
    expect(parseSavedSessions({ sessions: "x" })).toEqual([]);
  });

  it("resumes a conversation, and opens shells and empty sessions fresh, in the original order", () => {
    expect(
      restoreRequestsOf([
        { id: "shell", cwd: "/b", kind: "shell", prompted: false, startedAt: 30 },
        { id: "talk", cwd: "/a", kind: "claude", prompted: true, startedAt: 10 },
        { id: "empty", cwd: "/a", kind: "claude", prompted: false, startedAt: 20 },
      ]),
    ).toEqual([
      { startedAt: 10, launch: { cwd: "/a", resumeSessionId: "talk" } },
      { startedAt: 20, launch: { cwd: "/a" } },
      { startedAt: 30, launch: { cwd: "/b", kind: "shell" } },
    ]);
  });
});

describe("savedSessionsOf conversation", () => {
  it("saves the conversation the terminal moved to with /resume", () => {
    expect(savedSessionsOf([session({ id: "runner", conversationId: "picked" })])[0]?.id).toBe("picked");
  });
});
