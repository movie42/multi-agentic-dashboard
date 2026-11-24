import { z } from "zod";

export const SKETCH_TEXT_LIMIT = 5000;
export const SKETCH_ITEM_LIMIT = 2000;
export const SKETCH_POINT_LIMIT = 4000;

export const SKETCH_COLORS = ["ink", "yellow", "orange", "red", "green", "teal", "blue", "violet", "gray"] as const;
export const sketchColorSchema = z.enum(SKETCH_COLORS);

const finite = z.number().finite();
/** The worktree or project frame the item sits in, and where that frame's corner was when the item was put there. */
const parent = z.object({ id: z.string().min(1), x: finite, y: finite }).optional();
const box = { id: z.string().min(1), x: finite, y: finite, w: finite.positive(), h: finite.positive(), color: sketchColorSchema, parent };

export const sketchItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note"), ...box, text: z.string().max(SKETCH_TEXT_LIMIT) }),
  z.object({ kind: z.literal("text"), ...box, text: z.string().max(SKETCH_TEXT_LIMIT) }),
  z.object({ kind: z.literal("rect"), ...box }),
  z.object({ kind: z.literal("ellipse"), ...box }),
  z.object({ kind: z.literal("arrow"), id: z.string().min(1), x1: finite, y1: finite, x2: finite, y2: finite, color: sketchColorSchema, parent }),
  z.object({ kind: z.literal("pen"), id: z.string().min(1), points: z.array(z.tuple([finite, finite])).min(1).max(SKETCH_POINT_LIMIT), color: sketchColorSchema, parent }),
]);

export const sketchItemsSchema = z.array(sketchItemSchema).max(SKETCH_ITEM_LIMIT);

/** The file: every canvas's drawing, keyed by the canvas key (a repo path, or ":all"). */
export const sketchFileSchema = z.object({ boards: z.record(z.string(), sketchItemsSchema) });

export const sketchPutSchema = z.object({ key: z.string().min(1), items: sketchItemsSchema });
