import headless from "@xterm/headless";

export interface Screen {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  lines(): Promise<string[]>;
  dispose(): void;
}

export type CreateScreen = (cols: number, rows: number) => Screen;

export const createHeadlessScreen: CreateScreen = (cols, rows) => {
  const terminal = new headless.Terminal({ cols, rows, scrollback: 0, allowProposedApi: true });
  return {
    write: (data) => terminal.write(data),
    resize: (nextCols, nextRows) => terminal.resize(nextCols, nextRows),
    lines: () =>
      new Promise((resolve) => {
        terminal.write("", () => {
          const buffer = terminal.buffer.active;
          resolve(
            Array.from({ length: terminal.rows }, (_, row) => buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? ""),
          );
        });
      }),
    dispose: () => terminal.dispose(),
  };
};

/** Replays raw terminal output into a throwaway terminal and returns the last `maxLines` lines as plain text. */
export function renderLog(data: string, cols: number, maxLines: number): Promise<string> {
  const terminal = new headless.Terminal({ cols, rows: 24, scrollback: Math.max(maxLines, 24), allowProposedApi: true });
  return new Promise((resolve) => {
    terminal.write(data, () => {
      const buffer = terminal.buffer.active;
      const lines = Array.from({ length: buffer.length }, (_, row) => buffer.getLine(row)?.translateToString(true) ?? "");
      while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      terminal.dispose();
      resolve(lines.slice(-maxLines).join("\n"));
    });
  });
}
