import { services } from "@/server/container";
import type { CheckInput } from "@/server/workflow/featureCheck";
import type { BoardSnapshot } from "./types";

export function loadBoard(): Promise<BoardSnapshot> {
  return services().orca.board.load();
}

export function featureCheckInput(featureId: string): Promise<CheckInput> {
  return services().orca.board.featureCheckInput(featureId);
}
