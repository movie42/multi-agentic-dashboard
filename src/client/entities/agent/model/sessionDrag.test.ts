import { describe, expect, it } from "vitest";
import { acceptsSessionDrag, droppedSessionId, setSessionDrag } from "./sessionDrag";
import { thisWindowId } from "./sessionWindowChannel";

function fakeTransfer() {
  const data = new Map<string, string>();
  return {
    data,
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    get types() {
      return [...data.keys()];
    },
  };
}

describe("session drag", () => {
  it("carries the session to another window", () => {
    const transfer = fakeTransfer();
    setSessionDrag(transfer, "s1");
    expect(droppedSessionId(transfer)).toBe("s1");
  });

  it("is not taken back by the window it started in", () => {
    const transfer = fakeTransfer();
    setSessionDrag(transfer, "s1");
    expect(acceptsSessionDrag(transfer)).toBe(false);
    const elsewhere = fakeTransfer();
    for (const [type, value] of transfer.data) elsewhere.setData(type.replace(thisWindowId(), "other-window"), value);
    expect(acceptsSessionDrag(elsewhere)).toBe(true);
  });

  it("ignores drags that carry no session, such as a document tab", () => {
    const transfer = fakeTransfer();
    transfer.setData("application/x-agent-control-tab", "/repo/docs/a.html");
    expect(acceptsSessionDrag(transfer)).toBe(false);
    expect(droppedSessionId(transfer)).toBeNull();
  });
});
