"use client";

import { createPortal } from "react-dom";
import { ContextMenu, MenuHeading, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { DEFAULT_TOKEN, defaultColor, PART_LABEL, PARTS_OF, swatchColor, type ColorPart } from "../model/colorVars";
import { slotIndex, useCanvasColors } from "../model/useCanvasColors";
import { useItemColors, type ItemColorTarget } from "../model/useItemColors";
import { inputHex, tokenValue } from "./tokenValue";

interface ItemColorEditorProps {
  /** One scope at a time: the right-clicked frame, or the selected cards. */
  targets: ItemColorTarget[];
  title: string;
  at: MenuPoint;
  onClose: () => void;
}

/** Colours for one project, worktree or card (or every selected card), opened from the canvas's right-click menu. */
export function ItemColorEditor({ targets, title, at, onClose }: ItemColorEditorProps) {
  const [first] = targets;
  const items = useItemColors();
  const [canvasColors] = useCanvasColors();
  if (!first) return null;
  const { scope } = first;
  const customized = targets.some((target) => items.swatchOf(target) !== null || PARTS_OF[scope].some((part) => items.colorOf(target, part) !== null));
  const swatch = items.swatchOf(first);
  const fallbackToken = (part: ColorPart) => DEFAULT_TOKEN[scope][part] ?? "--fg";
  // The colour the first target is painted with: a part picked on its own, its swatch, the canvas-wide colour, the default.
  const shown = (part: ColorPart) =>
    items.colorOf(first, part) ??
    (swatch && inputHex(swatchColor(part, tokenValue(`--swatch-${swatch}`), tokenValue("--bg"), tokenValue("--fg")), fallbackToken(part))) ??
    canvasColors[slotIndex(scope, part)] ??
    inputHex(defaultColor(scope, part, tokenValue), fallbackToken(part));

  return createPortal(
    <ContextMenu at={at} label={`${title} 색`} onClose={onClose} widthClass="w-auto">
      <MenuHeading>{title} 색</MenuHeading>
      <div className="flex gap-3 px-2.5 pb-1.5">
        {PARTS_OF[scope].map((part) => (
          <label key={part} className="flex flex-col items-center gap-1 text-[11px] text-muted">
            <input
              type="color"
              value={shown(part)}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => items.paint(targets, part, event.target.value)}
              aria-label={`${PART_LABEL[part]} 색`}
              className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            {PART_LABEL[part]}
          </label>
        ))}
      </div>
      {customized && (
        <button
          type="button"
          onClick={() => items.clear(targets)}
          className="mx-1 rounded-md px-1.5 py-1.5 text-left text-[12px] font-semibold text-muted hover:bg-tint hover:text-fg"
        >
          기본 색으로
        </button>
      )}
    </ContextMenu>,
    document.body,
  );
}
