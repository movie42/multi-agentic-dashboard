"use client";

import { createContext, useContext } from "react";

/** True once the card has been answered or while its answer is being sent; every control turns read-only. */
export const A2uiLockContext = createContext(false);

export function useA2uiLocked(): boolean {
  return useContext(A2uiLockContext);
}
