import type { z } from "zod";
import type { sketchItemSchema, sketchColorSchema } from "./schema";

export type SketchColor = z.infer<typeof sketchColorSchema>;
export type SketchItem = z.infer<typeof sketchItemSchema>;
export type SketchKind = SketchItem["kind"];

export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SketchResponse = { ok: true; items: SketchItem[] } | { ok: false; error: string };
