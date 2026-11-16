# Handoff: 프로젝트 전체 보기 + 세션 오케스트레이션 (2026-11-16)

이전 세션이 남긴 인수인계 문서. 새 세션은 이 문서를 처음부터 끝까지 읽고 시작한다.

## 사용자가 처음부터 원한 것 (한 가지 기능)

프로젝트 단위로 관제하는 화면 하나. 사이드바에서 **프로젝트 이름을 누르면 프로젝트 전체 보기**가 열리고, 거기서

- 지휘자(코디네이터) 세션이 어떤 세션들에 일을 맡기고 어떻게 주고받는지를 **그래프로** 본다 (사용자 스케치: 맨 위 프로젝트 세션 → 워크트리별 점선 상자 안의 세션 상자들, 상자 사이 선 = 맡김 · 보고 · 끝나면 다음, 오른쪽 패널에서 바로 답하기)
- 지휘자가 없어도 워크트리별 세션을 한 화면에서 본다
- 지휘자는 프로젝트 단위 · 워크트리 단위 화면에서 만든다

사용자 말 그대로: "지휘자 모드도 볼수 있고, 워크트리별 작업도 볼수 있는걸 만드는게 목표였잖아", "지휘자가 없어도 전체보기는 열려야지", "계획 분리하더니 결국 내가 원하는대로 구현이 안됐어".

## 무엇이 잘못됐나

1. **계획이 둘로 쪼개졌다.** `docs/agent-control/tasks/project-overview.json`(화면 · 그래프)과 `docs/agent-control/tasks/session-orchestration.json`(데몬 동작). [[project-overview#R2-Q1]]에서 나눴고 [[session-orchestration#R1-Q1]]에서 "나눈 채로"를 추천안으로 확정했다. 그 결과 오케스트레이션 쪽만 구현되고, 사용자가 보려던 전체 보기 · 그래프 화면은 "P6 — project-overview 이후"로 밀렸다.
2. **project-overview는 구현 0.** tasks 단계가 `ask`(목록형 초안 기준 계획, "그래프 초안 확인 뒤 다시 씀") 상태로 멈춰 있다. 이전 세션은 이걸 확인하지 않고 오케스트레이션만 만들었다.
3. **진입점을 엉뚱하게 넣었다.** 처음에 '지휘자로 시작'을 전역 '전체' 화면의 새 세션 입력에 체크박스로 넣었다(사용자 지적 후 제거). 그다음 프로젝트 화면에 토글을 붙였는데, 그 화면은 실제로는 첫 워크트리 화면이었다(사용자 지적 후 수정).
4. **그래프가 없다.** 지금 전체 보기는 목록형(워크트리별 점선 상자 + 세션 줄)이고, 지휘자 관계는 들여쓰기와 "맡김 n · 끝나면 보고 n" 글자뿐이다. 스케치의 상자 · 화살표 · 선 종류 범례 · 오른쪽 패널은 없다.

## 지금 코드 상태 (main, 커밋 안 함)

브랜치 `main`, 전부 작업 트리에 미커밋으로 있다. 새 작업 전에 `git branch --show-current`로 확인하고, 사용자가 원하면 브랜치를 따서 올린다.

### 쓸 수 있는 것 — 데몬 오케스트레이션 (테스트 · 실측 완료)

- `src/common/orchestration/types.ts` — 선(`OrchestrationLink`: delegate / report / next), 지휘자(`Conductor`: scope · grants · rules · worktreeRequest), `SessionOrchestration`
- `daemon/orchestration/Orchestration.ts` — 선 · 지휘자 저장(`orchestration.json`), Stop 훅에서 report / next 실행, 바쁜 세션 줄 세우기, 같은 선 3번 왕복 시 멈춤
- `daemon/orchestration/conductorMcp.ts` — 지휘자 세션 전용 MCP(`/mcp/:id`, JSON-RPC 직접 구현): list_sessions · start_session · send_to_session · read_result · link_sessions · request_worktree · answer_permission
- `daemon/orchestration/grants.ts` — 위임 묶음(파일 편집 / 테스트·빌드 / git 커밋) 판정, git push · 체인 명령 차단
- `daemon/orchestration/lastAnswer.ts` — Stop 훅의 마지막 답 읽기
- `daemon/server.ts` · `daemon/main.ts` · `daemon/session/command.ts` — 라우트(`/links`, `/sessions/:id/delegate`, `/conductors/:id/worktree`, `POST /sessions`의 `conductor`), 지휘자 실행 플래그(`--mcp-config` · `--allowedTools mcp__agent-control` · `--append-system-prompt`)
- 앱: `RunnerSession.orchestration` · `AgentCard.orchestration` · `AgentCard.parentId`가 채워짐(`src/server/board/boardCards.ts`), 액션 `launch-conductor` · `delegate-permission` · `unlink-sessions` · `resume-link` · `answer-worktree-request`(`src/common/actions/schema.ts`, `src/server/orchestration/conductorActions.ts`, `conductorScope.ts`)
- 실측: 격리 데몬에서 실제 지휘자가 start_session으로 일꾼을 열고, 일꾼 답이 지휘자에게 보고로 들어옴을 확인. 실제 데몬(3198)도 이 코드로 재시작돼 있다.

### 임시로 붙인 화면 — 다시 설계할 대상

- `src/client/views/dashboard/ui/ProjectOverview.tsx` — 프로젝트 전체 보기(목록형): [워크트리별 | 지휘자] 전환, 새 세션 입력, '프로젝트 지휘자'
- `src/client/views/dashboard/ui/ConductorMap.tsx` — 지휘자 보기(목록형 + 들여쓰기), `GroupBox`
- `src/client/views/dashboard/ui/Dashboard.tsx` — `ProjectView`: 워크트리 미선택이면 `ProjectOverview`
- `src/client/widgets/project-sidebar/ui/ProjectSidebar.tsx` — 프로젝트 이름 클릭 = 전체 보기(접기는 ▶만), `ProjectWorktrees.tsx` — 미선택일 때 첫 워크트리 강조 안 함
- `src/client/features/conduct-sessions/` — `ConductorLauncher`(범위 · 맡길 권한 · 첫 요청), `OrchestrationPanel`(카드 안 워크트리 요청 확인 · 멈춘 선)
- `src/client/widgets/worktree-panel/ui/WorktreePanel.tsx` — 워크트리 ⋯ 메뉴 '지휘자'
- `src/client/features/answer-permission/ui/PermissionPrompt.tsx` — '앞으로 지휘자에게 맡기기'
- `src/client/shared/ui/ActionIcons.tsx` — `conductor` 아이콘 추가

### 검증 상태

- `bunx tsc --noEmit` 통과, `bun run test` 553개 통과
- `bun run lint`는 `daemon/session/SessionRegistry.ts:105-106`의 기존 오류 2건으로 실패(이번 변경과 무관)
- 실제 지휘자 아래 일꾼이 묶인 모습은 화면으로 아직 못 봄. 워크트리 메뉴 '지휘자'도 화면 확인 안 함

## 다음 세션이 할 일 (사용자가 정한 순서)

1. **계획 확인.** 두 문서를 읽는다: `python3 ~/.claude/skills/flow/scripts/flow.py brief docs/agent-control/tasks/project-overview.json`, 같은 명령으로 `session-orchestration.json`. SOT 맵은 `docs/agent-control/screens.json`의 [[S17]]–[[S25]](그래프 · 오른쪽 패널), 결정은 project-overview R1–R3, session-orchestration R1–R2.
2. **무엇이 잘못됐는지 정리.** 위 "무엇이 잘못됐나"를 계획 문서 기준으로 다시 확인하고, 사용자에게 짧게 보고한다.
3. **하나로 묶기.** 두 작업을 하나의 flow 작업으로 합친다(어느 쪽으로 합칠지, 다른 쪽은 어떻게 표시할지는 `/flow` 규칙대로). 합친 계획은 그래프 화면을 중심에 두고, 이미 있는 데몬 오케스트레이션을 재사용 항목으로 적는다. "나중에 붙인다"로 화면을 미루는 Phase를 만들지 않는다.
4. **계획 승인.** 합친 03 구현 계획을 페이지로 열고 사용자 승인을 받는다(`/flow` Step 4).
5. **재구현.** 승인 후 그래프 전체 보기를 구현하고, 임시 화면은 그래프에 흡수하거나 지운다. UI 변경 확인은 `bun run desktop` 후 앱을 종료했다 다시 열어야 반영된다(설치만으로는 떠 있는 앱이 그대로).

## 주의

- 이 대화 세션은 실제 데몬(pid는 매번 다름, 포트 3198) 아래에서 돈다. 데몬을 재시작하면 그 아래 세션이 모두 끊겼다 다시 열린다.
- 앞서 되돌린 `LaunchAgent.tsx` 체크박스 변경은 stash `b9431aee16de90d9883ee0efcba6658412d6e936`에 있다(되살릴 필요 없음).
- 사용자에게 답은 한국어로.
