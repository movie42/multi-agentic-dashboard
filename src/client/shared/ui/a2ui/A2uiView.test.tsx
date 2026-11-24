import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CATALOG_ID } from "@/common/a2ui/catalog";
import { A2uiView } from "./A2uiView";

const create = { version: "1.0", createSurface: { surfaceId: "pick", catalogId: CATALOG_ID } };
const components = (list: unknown[]) => ({ version: "1.0", updateComponents: { surfaceId: "pick", components: list } });

const surface = [
  create,
  components([
    { id: "root", component: "Column", children: ["title", "name", "go"] },
    { id: "title", component: "Text", text: "이름을 알려 주세요" },
    { id: "name", component: "TextField", value: { "@path": "/name" }, placeholder: "이름" },
    { id: "go", component: "Button", variant: "primary", child: "goLabel", action: { event: { name: "submit", context: { name: { "@path": "/name" } } } } },
    { id: "goLabel", component: "Text", text: "보내기" },
  ]),
  { version: "1.0", updateDataModel: { surfaceId: "pick", path: "/", value: { name: "" } } },
];

describe("A2uiView", () => {
  it("draws the surface and hands an action with its bound context to the callback", async () => {
    const onAction = vi.fn();
    render(<A2uiView messages={surface} onAction={onAction} />);
    expect(screen.getByText("이름을 알려 주세요")).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText("이름"), "현수");
    await userEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(onAction).toHaveBeenCalledWith({ surfaceId: "pick", name: "submit", context: { name: "현수" } });
  });

  it("turns every control read-only when locked", () => {
    render(<A2uiView messages={surface} onAction={() => {}} locked />);
    expect((screen.getByRole("button", { name: "보내기" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByPlaceholderText("이름") as HTMLInputElement).disabled).toBe(true);
  });

  it("toggles a selectable option list and keeps a single group to one pick", async () => {
    const messages = [
      create,
      components([
        { id: "root", component: "Column", children: ["a", "b"] },
        { id: "a", component: "Option", label: "A안", value: "A", single: true, selection: { "@path": "/picked" } },
        { id: "b", component: "Option", label: "B안", value: "B", single: true, selection: { "@path": "/picked" } },
      ]),
      { version: "1.0", updateDataModel: { surfaceId: "pick", path: "/", value: { picked: [] } } },
    ];
    render(<A2uiView messages={messages} onAction={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /A안/ }));
    expect(screen.getByRole("button", { name: /A안/ }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: /B안/ }));
    expect(screen.getByRole("button", { name: /A안/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /B안/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("explains a surface it cannot draw instead of crashing", () => {
    render(<A2uiView messages={[create, components([{ id: "root", component: "Bogus" }])]} onAction={() => {}} />);
    expect(screen.getByText(/카드를 그리지 못했어요/)).toBeTruthy();
  });
});
