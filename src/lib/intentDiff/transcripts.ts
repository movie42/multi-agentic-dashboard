import { services } from "@/server/container";
import { parseTranscript } from "@/server/intentDiff/parseTranscript";
import { type TranscriptEvents, UNTIL_SLACK_MS } from "@/server/intentDiff/TranscriptLoader";

export { parseTranscript, UNTIL_SLACK_MS };
export type { TranscriptEvents };

export function loadToolEvents(
  roots: string[],
  sources: string[],
  since: number,
  until: number | null,
): Promise<TranscriptEvents> {
  return services().transcriptLoader.load(roots, sources, since, until);
}
