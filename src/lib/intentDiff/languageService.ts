import { services } from "@/server/container";
import type { SymbolLookup } from "./types";

export function lookupSymbol(root: string, file: string, line: number, column: number, shownText: string | null): SymbolLookup {
  return services().languageServices.lookup(root, file, line, column, shownText);
}
