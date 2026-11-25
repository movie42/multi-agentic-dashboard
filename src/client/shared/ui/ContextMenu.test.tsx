import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu, MenuItem } from "./ContextMenu";

function renderMenu() {
  const onClose = vi.fn();
  const view = render(
    <>
      <div data-testid="chat" />
      <ContextMenu at={{ x: 10, y: 10 }} label="메뉴" onClose={onClose}>
        <MenuItem onSelect={() => {}}>항목</MenuItem>
      </ContextMenu>
    </>,
  );
  return { onClose, chat: view.getByTestId("chat"), menu: view.getByRole("menu") };
}

describe("ContextMenu", () => {
  it("stays open when a chat list scrolls itself to a new message", () => {
    const { onClose, chat } = renderMenu();
    fireEvent.scroll(chat);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the person scrolls the wheel outside the menu, not inside it", () => {
    const { onClose, chat, menu } = renderMenu();
    fireEvent.wheel(menu);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.wheel(chat);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
