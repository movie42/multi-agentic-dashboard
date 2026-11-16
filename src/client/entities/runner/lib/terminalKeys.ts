export interface TerminalKey {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/**
 * macOS editing shortcuts that xterm.js passes through as bare escape sequences shells and
 * Claude Code ignore. Returns the bytes Terminal.app/iTerm send for the same keys, or null to
 * let xterm handle the key itself.
 */
export function macTerminalSequence({ key, shiftKey, altKey, metaKey, ctrlKey }: TerminalKey): string | null {
  if (ctrlKey) return null;
  if (key === "Enter" && shiftKey && !altKey && !metaKey) return "\x1b\r";
  if (metaKey && !altKey) {
    if (key === "ArrowLeft") return "\x01";
    if (key === "ArrowRight") return "\x05";
    if (key === "Backspace") return "\x15";
    return null;
  }
  if (altKey && !metaKey) {
    if (key === "ArrowLeft") return "\x1bb";
    if (key === "ArrowRight") return "\x1bf";
    if (key === "Backspace") return "\x1b\x7f";
    if (key === "Delete") return "\x1bd";
  }
  return null;
}
