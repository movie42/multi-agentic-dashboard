# Agent Control

여러 worktree에서 동시에 돌아가는 Claude Code 에이전트를 한 화면에서 지켜보고, 내 차례가 된 것만 골라 바로 답하는 macOS용 관제 대시보드입니다.

![전체 화면 — 내 차례 · 에이전트 작업 중 · 쉬는 중](docs/readme/overview.png)

> 스크린샷은 모두 샘플 데이터로 찍었습니다.

## 왜 만들었나

에이전트를 worktree마다 하나씩 띄워 두면, 어느 터미널이 허락을 기다리는지, 어느 쪽이 끝났는지 알려면 탭을 하나씩 열어 봐야 합니다. Agent Control은 에이전트 세션을 직접 띄우고 그 상태를 모아서 **지금 내가 봐야 하는 것**부터 위에 올려 줍니다. 짧은 후속 지시는 카드의 입력창으로 보내고, 권한 허락과 질문 답변은 카드 안에서 여는 그 세션의 터미널에서 합니다.

## 주요 기능

- **차례별 보기** — 에이전트를 `내 차례` / `에이전트 작업 중` / `쉬는 중`으로 나누고, 막힘·입력 대기 → 중단됨 → 새 결과 순으로 정렬
- **카드 안 터미널** — 카드에서 그 세션의 터미널을 열어 권한 허락 · 질문 답변 · 직접 입력
- **빠른 답장** — 카드 아래 입력창으로 해당 세션에 바로 프롬프트 전송, 이미지 첨부 가능
- **단계별 보기** — flow 작업 문서를 읽어 기획·질문 → 계획 → 구현 → 검증 → 테스트 → PR 중 어디에 있는지 표시
- **기능별 worktree 묶음** — 같은 기능을 나눠 맡은 worktree를 묶고, rebase 필요 · 같은 파일 수정 · 공용 작업 대기 경고 표시
- **지난 세션** — 끝난 Claude Code 세션을 찾아 다시 열기
- **데스크톱 앱** — Dock에 고정되는 Electron 앱, `⌃⌥Space`로 어디서든 열기·숨기기

## 사용 방법

### 1. 전체 화면에서 내 차례 확인하기

왼쪽 사이드바의 **전체**를 누르면 모든 프로젝트의 에이전트가 세 구역으로 나뉘어 보입니다.

| 구역 | 들어가는 에이전트 |
|---|---|
| 내 차례 | 답을 끝냈거나, 권한·질문에 막혔거나, 중간에 멈춘 에이전트 |
| 에이전트 작업 중 | 아직 답을 쓰고 있는 에이전트 (오래 돈 순) |
| 쉬는 중 | 할 일 없이 쉬는 세션, 또는 **정리**로 치워 둔 에이전트 |

줄을 누르면 카드가 펼쳐집니다. **답장**은 카드를 펼치지 않고 바로 입력창만 엽니다. **이동 →**은 그 에이전트가 속한 프로젝트 화면으로 넘어갑니다. 위쪽 검색창에 프로젝트·브랜치·요청 내용을 입력하면 이 화면만 걸러집니다.

### 2. 권한 요청과 질문에 답하기

에이전트가 명령 실행 허락을 구하면 카드에 주황색 테두리 패널이 뜹니다.

<img src="docs/readme/permission.png" alt="Bash 실행 허락 카드" width="640">

- **허용** / **거부** — 이번 한 번만 결정
- **다시 묻지 않기** — 같은 종류의 명령을 이 프로젝트에서 계속 허용 (Claude Code가 제안한 규칙 그대로)
- **모드 전환** — 이번 세션을 `acceptEdits` 같은 모드로 바꿈

에이전트가 선택지를 내밀며 물어볼 때도 같은 자리에 질문 카드가 뜹니다. 보기를 누르거나 **직접 입력**에 답을 쓰면 터미널로 전달됩니다.

<img src="docs/readme/question.png" alt="AskUserQuestion 질문 카드" width="640">

> 권한 · 질문 카드는 아래 [권한 요청 훅 연결](#권한-요청-훅-연결)을 해야 나타납니다.

### 3. 단계별로 진척 보기

전체 화면 위쪽의 **단계별**을 누르면 worktree를 지금 있는 작업 단계로 묶어 보여 줍니다. 한 줄에서 작업 제목, 단계 진행 표시, 내 차례 · 작업 중 수를 함께 볼 수 있습니다.

![단계별 보기](docs/readme/stage.png)

단계 정보는 각 worktree의 `docs/<도메인>/tasks/*.json`(flow 작업 문서)에서 읽습니다. 문서가 없는 worktree는 맨 아래 **flow 문서 없음**에 모입니다.

### 4. 프로젝트 화면에서 기능 단위로 보기

사이드바에서 프로젝트를 고르면 worktree별 패널이 나옵니다. 같은 기능 문서를 공유하는 worktree는 기능 이름 아래에 묶입니다.

![프로젝트 화면 — 기능별 worktree 묶음과 경고](docs/readme/project.png)

- **원격 확인** — 기준 브랜치를 fetch해서 경고를 다시 계산합니다
  - `rebase 필요`: 기준 브랜치에 아직 받지 않은 커밋이 있는 worktree
  - `같은 파일 수정`: 두 worktree가 같은 파일을 고치고 있음
  - `공용 작업 대기`: 여러 작업이 기다리는 공용 코드의 PR이 아직 머지되지 않음
- **새 세션** — 이 worktree에서 Claude 세션을 새로 시작
- **터미널로** — 이 worktree에서 도는 세션의 터미널을 열고, 세션이 없으면 셸 터미널을 새로 열기

프로젝트 이름 옆의 **회사 / 개인** 배지는 진척 단계 구성을 바꿉니다. 저장소 owner가 내 GitHub 계정이면 개인(PRD → 질문 → 기획 …), 아니면 회사(기획·질문 → 계획 …)로 자동 판단하고, 배지를 눌러 바꿀 수 있습니다.

### 5. 어디서든 검색하기

`⌘K` 또는 `/`를 누르면 에이전트, worktree, 작업을 한 번에 찾는 검색창이 열립니다. 띄어쓰기로 여러 단어를 함께 찾을 수 있고, `Enter`로 바로 이동합니다.

![검색 팔레트](docs/readme/palette.png)

### 6. 지난 세션 다시 열기

사이드바의 **지난 세션**은 `~/.claude/projects` 아래 Claude Code 세션 기록을 모아 보여 줍니다. **다시 열기**를 누르면 그 폴더에서 세션을 이어서 시작해 세션 러너 창에 터미널을 띄우고, **resume 명령 복사**로 직접 터미널에서 이어갈 수도 있습니다.

![지난 세션](docs/readme/sessions.png)

### 7. 할일 보드

사이드바의 **할일**은 지라 이슈 · 마크다운 메모 · 그 일을 한 세션을 카드 하나에 모으는 칸반입니다. 보드는 `~/.local/share/agent-control/todos.json`에 저장되고(`TODO_FILE`로 경로 변경), sb 북마크 파일과는 따로입니다.

- **워크플로**: 상태와 전환(‘다음 →’)으로 된 흐름입니다. 처음과 끝 상태만 고정이고, 상태마다 ‘언제 이 상태인지’ 한 줄 설명을 둘 수 있습니다.
- **칸**: 상태 여러 개를 담는 그릇입니다. 칸 이름 · 숨기기 · 담을 상태는 칸 머리의 ⋯에서 바꿉니다.
- **세션 붙이기**: 에이전트 카드나 지난 세션 행의 ‘할일에 붙이기’, 또는 워크트리가 지정된 카드의 [새 세션]으로 붙입니다.
- **할일 에이전트**: 헤더 버튼으로 언제든 여는 대화창입니다. “예전 세션 중 선물하기 관련된 것 모아서 남은 할일 만들어 줘”, “이 카드 메모에 남은 일 적어 줘”, “끝난 카드는 지워 줘”처럼 말하면 에이전트가 지난 세션을 검색해 읽고 보드를 바로 바꿉니다(새 카드, 제목 · 메모 · 상태 · 지라 · 프로젝트 · 워크트리 수정, 세션 붙이기 · 떼기, 삭제). 바꾼 내용과 거절된 변경은 대화창에 한 줄씩 남습니다. 카드에 안 붙은 열린 세션은 버튼 옆에 개수로 보입니다. 에이전트는 도구 없는 `claude -p`이고 응답으로 변경 목록만 돌려주며, 대시보드 서버가 그 목록을 `/api/todos`와 같은 규칙으로 검사해 반영합니다. 검색은 에이전트가 고른 검색어로 서버가 세션 목록에서 찾아 넘깁니다. 모델은 `TODO_DRAFT_MODEL`(기본 `sonnet`)로 바꿉니다.
- **옮기기**: 앱이 스스로 옮기는 규칙은 없습니다. 사람은 드래그로 어디든 옮기고, 세션 안의 AI에게 부탁하면 아래 API로 옮깁니다.

#### 에이전트가 보드를 읽고 옮기는 법

서버 주소는 데스크톱 앱이 `http://127.0.0.1:3199`, 개발 서버가 `http://127.0.0.1:3100`입니다. 모든 변경은 `POST /api/todos` 하나로 보내고, 응답은 바뀐 보드 전체입니다.

```bash
# 워크플로(statuses: id · name · description · next)와 카드(cards: statusId · title · memo · jira · sessionIds)를 읽는다
curl -s http://127.0.0.1:3199/api/todos

# 카드를 옮긴다 — source "agent"는 지금 상태의 next에 있는 상태로만, 끝 상태로는 거절(409)
curl -s -X POST http://127.0.0.1:3199/api/todos -H 'Content-Type: application/json' \
  -d '{"type":"card-move","cardId":"<카드 id>","statusId":"<상태 id>","source":"agent"}'

# 끝으로 갈 만하면 옮기지 말고 제안만 남긴다 — 카드에 ‘끝으로 옮겨도 될 것 같아요’가 뜨고 사람이 옮긴다
curl -s -X POST http://127.0.0.1:3199/api/todos -H 'Content-Type: application/json' \
  -d '{"type":"card-suggest-done","cardId":"<카드 id>"}'

# 지금 세션을 카드에 붙인다 (세션 하나는 카드 하나에만 붙는다)
curl -s -X POST http://127.0.0.1:3199/api/todos -H 'Content-Type: application/json' \
  -d '{"type":"session-attach","cardId":"<카드 id>","sessionId":"<세션 id>"}'
```

작업 종류 전체는 `src/common/todos/ops.ts`의 `todoOpSchema`에 있습니다. AI 하네스(스킬, `CLAUDE.md` 등)에 이 내용을 넣으면 세션 안에서 “이 카드 리뷰로 옮겨 줘” 같은 요청을 처리할 수 있습니다.

### 단축키

| 키 | 동작 |
|---|---|
| `⌃⌥Space` | 어디서든 앱 열기 · 숨기기 (데스크톱 앱) |
| `j` / `k` | 카드 이동 |
| `r` | 빠른 답장 |
| `o` | 첫 결과물 열기 |
| `e` | 터미널 열기 |
| `/` · `⌘K` | 검색 |
| `esc` | 입력창 나가기 |

## 시작하기

### 준비물

- macOS
- [Node.js](https://nodejs.org) 24 이상 — 세션 러너 데몬이 TypeScript 파일을 그대로 실행합니다.
- [Claude Code](https://claude.com/claude-code)
- [Bun](https://bun.sh)
- [GitHub CLI](https://cli.github.com) (`gh`) — 로그인돼 있으면 PR 상태와 회사/개인 판단에 씁니다. 없어도 나머지 기능은 동작합니다.

### 개발 서버로 실행

```bash
bun install
bun run dev
```

http://127.0.0.1:3100 에서 열립니다. 세션 러너 데몬이 꺼져 있으면 첫 화면을 불러올 때 함께 뜹니다.

### 데스크톱 앱으로 빌드 · 설치

빌드와 설치를 한 번에 하려면:

```bash
bun run desktop
```

단계를 나눠 실행할 수도 있습니다.

```bash
bun run desktop:build    # .app 빌드만
bun run desktop:install  # 빌드된 .app을 설치하고 Dock에 고정
bun run skills:install   # 대시보드가 쓰는 스킬을 ~/.claude/skills에 복사
```

| 명령 | 하는 일 | 결과물 |
|---|---|---|
| `desktop:build` | `next build`로 서버를 단독 실행 가능한 형태로 빌드한 뒤, Electron으로 감싸 macOS 앱을 만듭니다. 앱 아이콘도 이때 생성합니다. | `dist/Agent Control-darwin-<arch>/Agent Control.app` (`<arch>`는 `arm64` 또는 `x64`) |
| `desktop:install` | 실행 중인 앱을 종료하고, 빌드된 앱을 복사한 뒤 Dock에 고정합니다. 이미 고정돼 있으면 그대로 둡니다. | `~/Applications/Agent Control.app` |
| `skills:install` | 이 저장소의 `skills/` 아래 스킬을 복사합니다. 워크트리 만들기 버튼이 쓰는 `ac-worktree`가 여기 있고, 터미널에서 `/ac-worktree`로도 쓸 수 있습니다. 예전 이름 `orca-worktree`로 깔린 스킬은 설치할 때 지웁니다. 지우려면 `skills:uninstall`. | `~/.claude/skills/<스킬 이름>/` |

앱을 실행하면 내부 서버가 `127.0.0.1:3199`에서 뜹니다. 포트를 바꾸려면 `AGENT_CONTROL_PORT` 환경 변수를 지정합니다. 코드나 `skills/`를 고친 뒤에는 `bun run desktop`을 다시 실행해야 앱과 스킬에 반영됩니다.

### 세션 러너 데몬

에이전트와 터미널 프로세스는 대시보드가 아니라 세션 러너 데몬(`daemon/`, `127.0.0.1:3198`)이 들고 있습니다. 개발 서버와 데스크톱 앱은 데몬이 꺼져 있으면 알아서 띄우고, 앱이나 개발 서버를 닫아도 데몬과 그 안의 세션은 계속 돕니다. 데몬을 끄면 세션도 함께 끝납니다.

```bash
bun run daemon                 # 직접 띄우기
pkill -f daemon/main.ts        # 끄기 (세션도 함께 종료)
```

- 데몬 로그는 `$TMPDIR/agent-control-runner.log`에 쌓입니다.
- 데스크톱 앱은 빌드할 때 쓴 `node`와 이 저장소의 `daemon/main.ts` 경로를 기억해 두고 그걸로 데몬을 띄웁니다. 저장소를 옮기거나 그 `node`를 지웠다면 `bun run desktop`을 다시 실행합니다.
- 대시보드를 3100 · 3199가 아닌 포트로 띄우면 `RUNNER_ALLOWED_ORIGINS=http://127.0.0.1:<포트>`를 지정해야 카드 터미널이 연결됩니다.

### 프로젝트와 워크트리

프로젝트 목록은 `~/.local/share/agent-control/projects.json`에, 워크트리의 표시 이름 · 부모 워크트리 · Jira 키는 같은 폴더의 `worktrees.json`에 저장합니다. 워크트리 자체는 각 프로젝트에서 `git worktree list`로 읽습니다. `projects.json`이 없는 첫 실행 때만, [Orca](https://github.com/stablyai/orca)가 설치돼 있으면 거기 등록된 프로젝트와 직접 붙인 워크트리 이름 · 부모 관계를 한 번 가져옵니다.

### 예전 권한 요청 훅 지우기

이전 버전에서 `bun run hook:install`로 `~/.claude/settings.json`에 권한 요청 훅을 등록했다면 지웁니다. 지금은 권한 허락과 질문 답변을 카드 안의 터미널에서 하므로 이 훅은 아무 일도 하지 않습니다.

```bash
bun run hook:uninstall
```

## 기술 스택

Next.js 16 · React 19 · Tailwind CSS 4 · TypeScript · Electron

## 구조

```
app/                # 페이지와 로컬 API (board · actions · sessions · worktree-wizard 등)
daemon/             # 세션 러너 데몬 — Claude · 셸 프로세스를 들고 터미널을 중계
src/
  client/           # 화면 (FSD: shared · entities · features · widgets · views)
  common/           # 서버와 화면이 함께 쓰는 타입 · 스키마
  server/board/     # 프로젝트 · git 워크트리 · 데몬 세션으로 보드 데이터 조립
  server/projects/  # 프로젝트 목록, 워크트리 메타, 워크트리 만들기 · 지우기
  server/runner/    # 데몬 호출과 자동 실행
  server/workflow/  # flow 작업 문서 · 기능 문서 · git/PR 상태 읽기
  server/sessions/  # Claude Code 세션 기록 읽기
desktop/            # Electron 진입점
scripts/            # 데스크톱 빌드 · 설치, 스킬 설치
skills/             # 대시보드가 쓰는 Claude Code 스킬 (skills:install로 설치)
```
