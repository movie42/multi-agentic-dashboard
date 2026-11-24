"use client";

import { PARTS_OF, SWATCHES } from "../model/colorVars";
import { useItemColors, type ItemColorTarget } from "../model/useItemColors";

interface ItemColorSwatchesProps {
  targets: ItemColorTarget[];
  /** Opens the editor that picks line, background and text one by one. */
  onCustom: () => void;
}

const DOT = "size-[18px] shrink-0 rounded-full outline-offset-2 hover:scale-110 aria-pressed:outline-2 aria-pressed:outline-fg";

/**
 * A row of swatches at the top of the canvas's right-click menu. One click paints the item, and the
 * menu stays open so another swatch can be tried against it.
 */
export function ItemColorSwatches({ targets, onCustom }: ItemColorSwatchesProps) {
  const items = useItemColors();
  const [first] = targets;
  if (!first) return null;
  const current = items.swatchOf(first);
  const ownColors = targets.some((target) => items.swatchOf(target) !== null || PARTS_OF[target.scope].some((part) => items.colorOf(target, part) !== null));

  return (
    <>
      <div className="flex items-center gap-1 px-2 py-1.5" aria-label="색">
        <button
          type="button"
          aria-label="기본 색"
          aria-pressed={!ownColors}
          title="캔버스 기본 색으로"
          onClick={() => items.clear(targets)}
          className={`${DOT} bg-canvas shadow-[inset_0_0_0_1.5px_var(--faint)]`}
        />
        {SWATCHES.map((swatch) => (
          <button
            key={swatch.name}
            type="button"
            aria-label={swatch.label}
            aria-pressed={current === swatch.name}
            title={swatch.label}
            onClick={() => items.paintSwatch(targets, swatch.name)}
            className={`${DOT} ${swatch.dot}`}
          />
        ))}
      </div>
      <button type="button" onClick={onCustom} title="라인 · 배경 · 글자를 하나씩 고르기" className="rounded-md px-2.5 py-1.5 text-left text-muted hover:bg-tint hover:text-fg">
        직접 고르기…
      </button>
    </>
  );
}
