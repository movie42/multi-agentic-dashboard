export interface SizeRange {
  min: number;
  max: number;
  fallback: number;
}

/** Height of one timeline row in px. */
export const ROW_HEIGHT: SizeRange = { min: 28, max: 200, fallback: 36 };
/** Width of the title column in px. */
export const TITLE_WIDTH: SizeRange = { min: 120, max: 720, fallback: 240 };

/** Must match the title's `leading-[18px]` and the row's `py-1`. */
const TITLE_LINE_PX = 18;
const ROW_PADDING_PX = 8;
/** Must match the bar's `leading-[14px]` and `py-0.5`. */
const BAR_LINE_PX = 14;
const BAR_PADDING_PX = 4;

export function clampSize(value: number, range: SizeRange): number {
  return Math.round(Math.min(Math.max(value, range.min), range.max));
}

export function readSize(stored: string | undefined, range: SizeRange): number {
  const value = Number(stored);
  return stored === undefined || !Number.isFinite(value) ? range.fallback : clampSize(value, range);
}

/** Lines of the card title that fit in a row; the last one ends in an ellipsis when more text remains. */
export function titleLines(rowHeight: number): number {
  return Math.max(1, Math.floor((rowHeight - ROW_PADDING_PX) / TITLE_LINE_PX));
}

/** Lines of the bar label that fit in a row. */
export function barLines(rowHeight: number): number {
  return Math.max(1, Math.floor((rowHeight - ROW_PADDING_PX - BAR_PADDING_PX) / BAR_LINE_PX));
}
