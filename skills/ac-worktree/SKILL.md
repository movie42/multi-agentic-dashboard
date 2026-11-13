---
name: ac-worktree
description: Create a new git worktree for the Agent Control dashboard from any branch or worktree, asking the user as little as possible. Use when the user asks to open, make or branch off a worktree — "워크트리 열어줘", "이 브랜치에서 워크트리 만들어줘", "새 워크트리", "open a worktree from develop", "/ac-worktree". Also used headlessly by the Agent Control dashboard, which appends its own output rules.
---

# Create a worktree for Agent Control

The user repeats "open a worktree from this branch" many times a day. The goal is one question at
most: what the work is. Everything else comes from where they are standing and from the
conventions below. They can still correct any field on the plan before anything is created.

The worktree is made with plain `git worktree add`, exactly where and how the Agent Control
dashboard makes one, and what git does not record (the name shown on the board, the parent
worktree, the Jira key) goes into the dashboard's `worktrees.json`. A worktree made here and one
made from the dashboard look the same on the board.

## 1. Gather the facts (do not ask for these)

| Fact | Where it comes from |
|---|---|
| Current worktree | `git rev-parse --show-toplevel` in the cwd |
| Project | the main checkout: the first `worktree` line of `git worktree list --porcelain` |
| Base branch | the branch the user is on, or the one they named ("develop에서") |
| Parent | the current worktree when the base is its branch; none when the base is a shared root (`main`, `master`, `develop`, `staging`, `release/*`, `main-*`, `develop-*`) |
| Existing names | `git worktree list --porcelain` (worktree folders) and `git branch -a --format='%(refname:short)'` (taken branch names) |

When the dashboard runs this skill, these facts are already in the prompt — use them and run nothing.

## 2. The one question

Ask only for what the work is: a Jira key (`COMP-603`), a short description, or both. Skip the
question entirely when the request already says it ("COMP-611 워크트리 열어줘", "결제 리팩터링
워크트리"). Never ask about base branch, parent, folder or branch prefix — propose them.

Ask a second question only when the facts genuinely conflict, for example the named base branch
does not exist locally or remotely. Offer the closest existing branches as options.

## 3. Build the plan with these conventions

| Field | Rule | Example |
|---|---|---|
| `name` (worktree / folder) | the Jira key when there is one; otherwise a kebab-case English slug of 2–4 words | `COMP-611`, `gift-easy-payment` |
| `branch` | `feat/<name>`; `fix/<name>` when the work is a bug fix; under a story branch `feat/<STORY>`, a sub-issue gets `feat/<KEY>` too | `feat/COMP-611`, `fix/login-redirect` |
| `baseBranch` | from § 1 | `develop`, `feat/COMP-600` |
| `parent` | `from` (link to the worktree the user is in) or `none`, from § 1 | |
| `reference` | the Jira key, if any | `COMP-611` |
| `firstPrompt` | empty unless the user explicitly stated work for the new session to start on | |

- If `name` or `branch` is already taken, add a numeric suffix (`-2`) and say so in the summary.
- Match the repo's existing pattern when it differs (`feature/VDCO-3479` in a repo whose branches all
  use `feature/`).
- The folder is always next to the project folder: `<dirname of project>/<basename of project>-<name>`
  (project `/code/shop`, name `COMP-611` → `/code/shop-COMP-611`).

## 4. Confirm, then create (interactive sessions only)

Show the plan as a short table, folder included, and ask once to confirm or correct
(AskUserQuestion: 만들기 / 고치기). On confirm:

1. Resolve the base: use `<baseBranch>` when `git rev-parse --verify --quiet refs/heads/<baseBranch>`
   succeeds, else `origin/<baseBranch>` when `refs/remotes/origin/<baseBranch>` exists, else
   `<baseBranch>` as given.
2. Create it from the project folder:

   ```bash
   git -C <project> worktree add --no-track -b <branch> <folder> <base>
   ```

3. Record it for the board. The data folder is `$AGENT_CONTROL_DATA_DIR`, else
   `~/.local/share/agent-control`. Run this with the values filled in (`parentPath` is the current
   worktree's path when `parent` is `from`; leave `parentPath` or `reference` out when there is none):

   ```bash
   node -e '
   const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
   const dir = process.env.AGENT_CONTROL_DATA_DIR || path.join(os.homedir(), ".local", "share", "agent-control");
   const file = path.join(dir, "worktrees.json");
   const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { worktrees: {} };
   const [folder, entry] = [process.argv[1], JSON.parse(process.argv[2])];
   data.worktrees[folder] = { ...data.worktrees[folder], ...entry };
   fs.mkdirSync(dir, { recursive: true });
   fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
   ' "<folder>" '{"displayName":"<name>","parentPath":"<current worktree>","reference":"<KEY>"}'
   ```

4. When the project folder is not in `<data folder>/projects.json`, say so in one line: the board
   shows the worktree once the project is added from the dashboard's 프로젝트 가져오기.
5. With a `firstPrompt`, do not start a session yourself. Tell the user to launch it from the new
   worktree's row on the dashboard, quoting the prompt.

Report the new worktree path in one line. Do not switch the user's current session into it.

## Dashboard mode

The Agent Control dashboard runs this skill with `claude -p`, read-only tools and the facts already
in the prompt. In that mode the dashboard's appended rules win: never run commands, never create
anything, and answer only with the structured output it asks for — a question (`kind: "ask"`) or the
plan (`kind: "plan"`). The dashboard shows the plan to the user and, after they confirm, creates the
worktree itself the same way as § 4.
