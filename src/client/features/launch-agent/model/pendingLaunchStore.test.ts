import { beforeEach, describe, expect, it } from "vitest";
import type { AgentCard } from "@/common/orca/types";
import { PENDING_LAUNCH_TTL_MS, usePendingLaunchStore } from "./pendingLaunchStore";

const agent = (id: string, worktreePath = "/w/a", parentId: string | null = null) =>
  ({ id, worktreePath, parentId }) as AgentCard;

describe("pendingLaunchStore", () => {
  beforeEach(() => usePendingLaunchStore.setState({ pending: [] }));

  it("keeps the placeholder until a new top-level session shows up in that worktree", () => {
    const { start, settle } = usePendingLaunchStore.getState();
    start("/w/a", [agent("old")], 0);
    settle([agent("old"), agent("worker", "/w/a", "old"), agent("other", "/w/b")], 1);
    expect(usePendingLaunchStore.getState().pending).toHaveLength(1);
    settle([agent("old"), agent("new")], 2);
    expect(usePendingLaunchStore.getState().pending).toHaveLength(0);
  });

  it("lets one arrived session settle only one of two launches", () => {
    const { start, settle } = usePendingLaunchStore.getState();
    start("/w/a", [], 0);
    start("/w/a", [], 1);
    settle([agent("first")], 2);
    expect(usePendingLaunchStore.getState().pending).toHaveLength(1);
  });

  it("drops a placeholder on cancel and after the TTL", () => {
    const { start, cancel, settle } = usePendingLaunchStore.getState();
    const id = start("/w/a", [], 0);
    start("/w/a", [], 0);
    cancel(id);
    expect(usePendingLaunchStore.getState().pending).toHaveLength(1);
    settle([], PENDING_LAUNCH_TTL_MS + 1);
    expect(usePendingLaunchStore.getState().pending).toHaveLength(0);
  });
});
