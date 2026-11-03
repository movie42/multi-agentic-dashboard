# Changelog

버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다. `package.json`의 `version`이 데스크톱 앱(Agent Control.app) 버전으로 그대로 들어갑니다.

## [0.1.0] - 2026-11-03

첫 버전.

### 추가

- 에이전트를 `내 차례` / `에이전트 작업 중` / `쉬는 중`으로 나눈 차례별 목록, 줄마다 답장 · 이동 버튼
- worktree별 flow 작업 단계를 보여 주는 단계별 보기
- 프로젝트 화면에서 기능 문서(`feature.json`) 단위 worktree 묶음, `rebase 필요` · `같은 파일 수정` · `공용 작업 대기` 경고, 새 세션 · 터미널로 버튼
- Claude Code 권한 요청과 `AskUserQuestion` 질문을 카드에서 바로 답하는 권한 요청 훅
- 카드의 빠른 답장, 이미지 · 파일 첨부(Finder 선택 · 드래그 앤 드롭 · 붙여넣기)
- 지난 Claude 세션 찾기와 Orca에서 다시 열기
- 알림, Dock 개수 표시, ⌘K 검색 팔레트, 키보드 단축키
- Electron 데스크톱 앱, `⌃⌥Space`로 열기 · 숨기기

[0.1.0]: https://github.com/movie42/multi-agentic-dashboard/releases/tag/v0.1.0
