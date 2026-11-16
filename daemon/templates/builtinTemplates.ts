import { BUILTIN_TEMPLATE_PREFIX, type TemplateCard, type WorkflowTemplate } from "../../src/common/templates/types.ts";

const card = (key: string, title: string, prompt: string, extra: Partial<TemplateCard> = {}): TemplateCard => ({
  key,
  title,
  prompt,
  kind: "work",
  model: null,
  effort: null,
  continueFrom: false,
  pauseAfter: false,
  check: null,
  ...extra,
});

const FLOW: WorkflowTemplate = {
  id: `${BUILTIN_TEMPLATE_PREFIX}flow`,
  name: "flow 흐름 (계획 → 구현 → 검증 → 리뷰 → PR 초안)",
  cards: [
    card(
      "plan",
      "계획",
      "flow 스킬로 이번 작업을 진행해 주세요. 01 기획부터 03 구현 계획까지 쓰고, 확인이 필요한 것은 질문으로 올려 답을 받아 반영해 주세요. 계획이 승인되기 전에는 코드를 고치지 마세요.",
      { pauseAfter: true },
    ),
    card(
      "build",
      "구현",
      "승인된 03 구현 계획대로 Phase를 순서대로 구현해 주세요. Phase마다 검증 항목의 명령을 돌리고, 실패하면 다음 Phase 전에 고쳐 주세요.",
      { continueFrom: true },
    ),
    card(
      "verify",
      "검증",
      "이 워크트리의 변경을 검증해 주세요. 프로젝트의 타입 검사 · 린트 · 테스트 명령을 찾아 돌리고, 실패한 것은 원인과 함께 정리해 주세요. 코드는 고치지 말고 결과만 보고해 주세요.",
      { effort: "low" },
    ),
    card(
      "review",
      "리뷰",
      "앞 카드의 검증 결과와 이 브랜치의 변경(git diff)을 보고, 고칠 것이 없으면 '통과', 고칠 것이 있으면 '고칠 것 있음' 길을 골라 주세요. 고를 때 이유에 고칠 것을 파일과 함께 적어 주세요.",
      { kind: "judge", model: "sonnet", effort: "low" },
    ),
    card(
      "pr",
      "PR 초안",
      "git-pr 스킬의 PR 본문 템플릿과 규칙을 읽고 이 브랜치의 PR 제목과 본문 초안만 써 주세요. PR을 만들거나 push하지는 마세요.",
      { pauseAfter: true },
    ),
  ],
  routes: [
    { id: "plan-build", from: "plan", to: "build", label: null },
    { id: "build-verify", from: "build", to: "verify", label: null },
    { id: "verify-review", from: "verify", to: "review", label: null },
    { id: "review-pr", from: "review", to: "pr", label: "통과" },
    { id: "review-build", from: "review", to: "build", label: "고칠 것 있음" },
  ],
  updatedAt: 0,
};

export const BUILTIN_TEMPLATES: WorkflowTemplate[] = [FLOW];
