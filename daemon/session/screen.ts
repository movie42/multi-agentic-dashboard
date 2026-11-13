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
