import { describe, expect, it } from "vitest";
import { macTerminalSequence, type TerminalKey } from "./terminalKeys";

const press = (key: string, mods: Partial<Omit<TerminalKey, "key">> = {}): TerminalKey => ({
  key,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  ...mods,
});

describe("macTerminalSequence", () => {
  it("sends meta-enter for Shift+Enter so Claude Code inserts a newline", () => {
    expect(macTerminalSequence(press("Enter", { shiftKey: true }))).toBe("\x1b\r");
  });

  it("moves by word with Option+arrow", () => {
    expect(macTerminalSequence(press("ArrowLeft", { altKey: true }))).toBe("\x1bb");
    expect(macTerminalSequence(press("ArrowRight", { altKey: true }))).toBe("\x1bf");
    expect(macTerminalSequence(press("ArrowLeft", { altKey: true, shiftKey: true }))).toBe("\x1bb");
  });

  it("jumps to line start and end with Cmd+arrow", () => {
    expect(macTerminalSequence(press("ArrowLeft", { metaKey: true }))).toBe("\x01");
    expect(macTerminalSequence(press("ArrowRight", { metaKey: true }))).toBe("\x05");
  });

  it("deletes a word with Option+Backspace and the line with Cmd+Backspace", () => {
    expect(macTerminalSequence(press("Backspace", { altKey: true }))).toBe("\x1b\x7f");
    expect(macTerminalSequence(press("Backspace", { metaKey: true }))).toBe("\x15");
  });

  it("leaves plain keys and Cmd shortcuts like copy to xterm and the app menu", () => {
    expect(macTerminalSequence(press("Enter"))).toBeNull();
    expect(macTerminalSequence(press("ArrowLeft"))).toBeNull();
    expect(macTerminalSequence(press("c", { metaKey: true }))).toBeNull();
    expect(macTerminalSequence(press("ArrowLeft", { ctrlKey: true }))).toBeNull();
  });

  it("sends Ctrl+letter from the physical key, so it works with the Korean input source on", () => {
    expect(macTerminalSequence(press("ㅁ", { ctrlKey: true, code: "KeyA" }))).toBe("\x01");
    expect(macTerminalSequence(press("Process", { ctrlKey: true, code: "KeyK" }))).toBe("\x0b");
    expect(macTerminalSequence(press("c", { ctrlKey: true, code: "KeyC" }))).toBe("\x03");
    expect(macTerminalSequence(press("A", { ctrlKey: true, shiftKey: true, code: "KeyA" }))).toBeNull();
  });
});
