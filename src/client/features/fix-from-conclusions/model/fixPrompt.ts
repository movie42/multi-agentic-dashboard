import { isSendable } from "@/common/intentDiff/conclusion";
import type { AskAnchor, AskConclusion, AskThread } from "@/common/intentDiff/types";

export type SendableThread = AskThread & { conclusion: AskConclusion };

export function sendableThreads(threads: AskThread[]): SendableThread[] {
  return threads.filter((thread): thread is SendableThread => isSendable(thread.conclusion));
}

function where(anchor: AskAnchor): string {
  return anchor.startLine === anchor.endLine ? `${anchor.file}:${anchor.startLine}` : `${anchor.file}:${anchor.startLine}-${anchor.endLine}`;
}

export function fixPrompt(threads: SendableThread[]): string {
  return [
    `diff 리뷰에서 정리한 결론 ${threads.length}개를 반영해 코드를 고쳐 주세요.`,
    "결론마다 위치와 지시가 있어요. 위치의 줄 번호는 리뷰할 때 기준이라 조금 달라졌을 수 있어요.",
    "모두 고친 뒤 프로젝트의 타입 검사와 테스트를 돌려 주세요.",
    "",
    ...threads.flatMap((thread, index) => [`${index + 1}. \`${where(thread.anchor)}\` (${thread.label})`, `   ${thread.conclusion.text.replace(/\n/g, "\n   ")}`]),
  ].join("\n");
}
