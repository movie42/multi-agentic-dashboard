import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_ID } from "@/common/a2ui/catalog";
import type { ActivityStep } from "@/common/sessions/types";
import { postAction } from "@/client/shared/api/actions";
import { UiActionTarget, UiRow } from "./UiRow";

vi.mock("@/client/shared/api/actions", () => ({ postAction: vi.fn() }));
const post = vi.mocked(postAction);

const step: Extract<ActivityStep, { kind: "ui" }> = {
  kind: "ui",
  id: "t1",
  at: null,
  surfaceId: "pick",
  status: "ok",
  action: null,
  messages: [
    { version: "1.0", createSurface: { surfaceId: "pick", catalogId: CATALOG_ID } },
    {
      version: "1.0",
      updateComponents: {
        surfaceId: "pick",
        components: [{ id: "root", component: "Option", label: "A안", action: { event: { name: "choose", context: { plan: "A" } } } }],
      },
    },
  ],
};

beforeEach(() => post.mockReset());

describe("UiRow", () => {
  it("sends the person's action to the live terminal and locks the card", async () => {
    post.mockResolvedValue();
    render(
      <UiActionTarget.Provider value="term-1">
        <UiRow step={step} />
      </UiActionTarget.Provider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /A안/ }));
    expect(post).toHaveBeenCalledWith({ type: "a2ui-action", terminalHandle: "term-1", surfaceId: "pick", name: "choose", context: { plan: "A" } });
    expect(await screen.findByText(/plan: A/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /A안/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an earlier answer from the transcript as locked", () => {
    render(
      <UiActionTarget.Provider value="term-1">
        <UiRow step={{ ...step, action: { surfaceId: "pick", name: "choose", context: { plan: "A" } } }} />
      </UiActionTarget.Provider>,
    );
    expect((screen.getByRole("button", { name: /A안/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("stays read-only without a live terminal", () => {
    render(<UiRow step={step} />);
    expect(screen.getByText("터미널이 닫혀 있어서 답할 수 없어요")).toBeTruthy();
  });
});
