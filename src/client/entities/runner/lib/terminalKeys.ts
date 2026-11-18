export interface TerminalKey {
  key: string;
  /** Physical key (`KeyA`), the same whichever input source is on. */
  code?: string;
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
export function macTerminalSequence({ key, code, shiftKey, altKey, metaKey, ctrlKey }: TerminalKey): string | null {
  if (ctrlKey) return controlSequence(code, shiftKey || altKey || metaKey);
  return editingSequence(key, shiftKey, altKey, metaKey);
}

/**
 * xterm.js derives Ctrl+letter from `keyCode`, which the browser reports as 229 ("IME busy") while the
 * Korean input source is on, so Ctrl+A / Ctrl+K reached nothing. The physical key is read instead.
 */
function controlSequence(code: string | undefined, modified: boolean): string | null {
  const letter = /^Key([A-Z])$/.exec(code ?? "")?.[1];
  if (modified || !letter) return null;
  return String.fromCharCode(letter.charCodeAt(0) - 64);
}

function editingSequence(key: string, shiftKey: boolean, altKey: boolean, metaKey: boolean): string | null {
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
