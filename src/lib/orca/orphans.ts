import { services } from "@/server/container";
import type { OrcaTerminalRaw } from "./types";

export function reattachOrphans(terminals: OrcaTerminalRaw[]): void {
  void services().orca.orphans.reattach(terminals);
}
