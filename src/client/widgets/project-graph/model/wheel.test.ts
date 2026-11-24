// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { keepsWheel } from "./wheel";

const sized = (scrollHeight: number, clientHeight: number) => {
  const box = document.createElement("div");
  box.setAttribute("data-scroll-overflow", "");
  Object.defineProperty(box, "scrollHeight", { value: scrollHeight });
  Object.defineProperty(box, "clientHeight", { value: clientHeight });
  const inner = document.createElement("span");
  box.append(inner);
  return inner;
};

describe("keepsWheel", () => {
  it("leaves the wheel to a panel that always scrolls", () => {
    const panel = document.createElement("div");
    panel.setAttribute("data-scroll", "");
    const inner = document.createElement("span");
    panel.append(inner);
    expect(keepsWheel(inner)).toBe(true);
  });

  it("leaves the wheel to a memo only while its text overflows", () => {
    expect(keepsWheel(sized(400, 120))).toBe(true);
    expect(keepsWheel(sized(120, 120))).toBe(false);
  });

  it("pans the canvas everywhere else", () => {
    expect(keepsWheel(document.createElement("div"))).toBe(false);
    expect(keepsWheel(null)).toBe(false);
  });
});
