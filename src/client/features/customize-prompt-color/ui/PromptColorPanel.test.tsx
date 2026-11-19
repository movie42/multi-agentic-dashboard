import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useStoredListStore } from "@/client/shared/lib/storedListStore";
import { PromptColorPanel } from "./PromptColorPanel";
import { PromptColorSync } from "./PromptColorSync";

afterEach(() => {
  window.localStorage.clear();
  useStoredListStore.setState({ lists: {} });
  document.documentElement.removeAttribute("style");
});

describe("PromptColorPanel", () => {
  it("applies picked colours to the page, keeps them, and resets to the default tokens", async () => {
    render(
      <>
        <PromptColorSync />
        <PromptColorPanel />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: /요청 색/ }));
    fireEvent.change(screen.getByLabelText("요청 배경 색"), { target: { value: "#112233" } });
    fireEvent.change(screen.getByLabelText("요청 글자 색"), { target: { value: "#ddeeff" } });

    const root = document.documentElement.style;
    expect(root.getPropertyValue("--prompt-custom")).toBe("#112233");
    expect(root.getPropertyValue("--prompt-ink-custom")).toBe("#ddeeff");
    expect(JSON.parse(window.localStorage.getItem("agent-control:prompt-colors") ?? "[]")).toEqual(["#112233", "#ddeeff"]);

    await userEvent.click(screen.getByRole("button", { name: "기본 색으로" }));
    expect(root.getPropertyValue("--prompt-custom")).toBe("");
    expect(root.getPropertyValue("--prompt-ink-custom")).toBe("");
    expect(screen.queryByRole("button", { name: "기본 색으로" })).toBeNull();
  });
});
