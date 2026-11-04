"use client";

import { createContext } from "react";
import type { FeatureFile, FileDiff, Hunk } from "@/common/intentDiff/types";

export interface HunkEntry {
  file: FileDiff;
  hunk: Hunk;
  /** The file's place in the import graph of changed files. */
  node: FeatureFile | null;
}

export const HunkLookup = createContext<Map<string, HunkEntry>>(new Map());
