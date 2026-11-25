import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageMenu } from "./PageMenu";

afterEach(() => vi.restoreAllMocks());

describe("PageMenu", () => {
  it("opens the page here or in its own window", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(window);
    const onOpen = vi.fn();
    const onClose = vi.fn();
    render(<PageMenu page="todo" label="할일" at={{ x: 10, y: 10 }} onOpen={onOpen} onClose={onClose} />);

    await userEvent.click(screen.getByRole("menuitem", { name: /새 창에서 열기/ }));
    expect(open).toHaveBeenCalledWith("/?page=todo", "page:todo", expect.stringContaining("popup"));
    expect(onClose).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("menuitem", { name: /^열기/ }));
    expect(onOpen).toHaveBeenCalled();
  });
});
