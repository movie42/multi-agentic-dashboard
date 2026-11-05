import { z } from "zod";
import type { AskConclusion, AskThread } from "./types";

const threadId = z.string().min(1);

export const conclusionRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draft"), threadId }),
  z.object({ type: z.literal("judge"), threadId, needsChange: z.boolean() }),
  z.object({ type: z.literal("confirm"), threadId, text: z.string().trim().min(1).max(4000) }),
  z.object({ type: z.literal("sent"), threadIds: z.array(threadId).min(1) }),
]);

export type ConclusionRequest = z.infer<typeof conclusionRequestSchema>;

export type ConclusionResponse = { ok: true; threads: AskThread[] } | { ok: false; error: string };

export function judgeConclusion(conclusion: AskConclusion, needsChange: boolean, now: number): AskConclusion {
  return { ...conclusion, needsChange, confirmedAt: conclusion.confirmedAt === null ? null : now };
}

export function confirmConclusion(conclusion: AskConclusion, text: string, now: number): AskConclusion {
  return { ...conclusion, text, confirmedAt: now };
}

export function markSent(conclusion: AskConclusion, now: number): AskConclusion {
  return { ...conclusion, sentAt: now };
}

/** Confirmed, judged worth a change, and not sent since it was last confirmed. */
export function isSendable(conclusion: AskConclusion | null | undefined): conclusion is AskConclusion {
  if (!conclusion || conclusion.confirmedAt === null || !conclusion.needsChange) return false;
  return conclusion.sentAt === null || conclusion.confirmedAt > conclusion.sentAt;
}

export function isSent(conclusion: AskConclusion | null | undefined): boolean {
  return !!conclusion && conclusion.sentAt !== null && conclusion.confirmedAt !== null && conclusion.confirmedAt <= conclusion.sentAt;
}
