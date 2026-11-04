# Refactor conventions (multi-paradigm · FSD)

Plan and decisions: `docs/agent-control/tasks/refactor-architecture.json` (rounds R1–R3, phases P0–P6).
Every session working on this refactor follows these rules.

## Target layout

- `app/` (repo root, Phase 4) — Next.js routes only: validate input, call a server service, return.
- `src/server/<domain>/` — Node-only code. Every file starts with `import "server-only"` (tests alias it to an empty stub).
- `src/common/` — types and zod schemas shared by server and client.
- `src/client/` — FSD layers (`views`, `widgets`, `features`, `entities`, `shared`).
- Import direction: `server → common`, `client → common`, `app → everything`. `server` and `client` never import each other.

## Phase 3 rules — state in classes, transforms in pure functions

1. A module that holds state or does I/O becomes a class in `src/server/<domain>/<Name>.ts`. Its dependencies (file paths, clock, exec/spawn functions, other services) come in through the constructor so tests can pass fakes.
2. No module-level mutable state: no top-level `let`, no top-level `new Map()`/`new Set()`/array that gets mutated, no `globalThis.__*` caches. Instances live in `services()` in `src/server/container.ts` (the only `globalThis` holder, so HMR keeps one instance).
3. The old file under `src/lib/...` keeps its exported function names as thin wrappers that delegate to `services().<name>`, so callers do not change in Phase 3. Phase 4 moves callers and deletes the wrappers.
4. Parsing and data shaping are exported pure functions (input → output, no I/O) with unit tests next to them.
5. Caches use `lru-cache` with a `max`. If the source has a cheap change signal (file `mtime`, git HEAD/tree SHA), put it in the key or compare it — no TTL. If it has none (GitHub PR state via `gh`), use `ttl` + `allowStale` + `fetchMethod` so the stale value shows while a fresh one loads.
6. Data read from disk (state files, JSONL logs, transcript lines) is validated with a zod schema in `src/server/<domain>/schema.ts`. Use `z.looseObject` for formats owned by other tools (Claude Code transcripts, `sb` bookmarks).
7. Errors are never swallowed. No empty `catch {}`, no silent `.catch(() => null)`. Report with `reportWarning(scope, error, context)` / `reportError(...)` from `src/server/container.ts` (writes console + `~/Library/Logs/agent-control/app.log`), then fall back. An expected miss (ENOENT on an optional file) may return the fallback without a report, checked by code, not by catching everything.
8. `let` only where state truly moves together: character/line scanners, stream buffers, position-walking loops. Everything else is `const` + array/object methods.
9. TypeScript: no `any`, minimise `as` (prefer zod or type guards), no `export *`, props as `interface`.
10. No code comments. Never remove `console.log/warn/error`.

## Done means

- Existing tests pass unchanged — they pin current behavior: `bun run test`, `bun run test:contract`.
- `bunx tsc --noEmit` and `bun run lint` exit 0 (only the 2 existing warnings allowed).
- `E2E_PORT=<your port> bun run e2e` passes (default 3197; parallel sessions use different ports).
- New classes have unit tests with injected fakes.
- Commit on your own branch, Korean message with `refactor:` prefix, no scope in parentheses, no `Co-Authored-By`, no push.

## Phase 4 result — where things live now

- `src/lib` is gone. Server code calls `services()` from `src/server/container.ts`; dependencies between services are passed through constructors there.
- Client code is FSD under `src/client`. Each slice exposes only what other slices use through its `index.ts`; inside a slice use relative imports. `eslint.config.mjs` enforces layer direction, no cross-slice imports within a layer, and no deep imports into a slice.
- Shared types and zod schemas: `src/common/<domain>/`.

## Phase 5 rules — React 19 on the client

1. Server data on the client goes through TanStack Query. One `QueryClient` provided from `app/providers.tsx` (a `"use client"` component used by `app/layout.tsx`). Query keys and `queryOptions` live next to the entity they fetch: `src/client/entities/<entity>/api/`. Polling uses `refetchInterval`, not `useEffect` + `setTimeout`.
2. A failed background fetch shows in the panel with `StatusLine` from `@/client/shared/ui/StatusLine` (pass `query.error`). A failed user action calls `toastError(scope, error)` from `@/client/shared/model/toastStore`. Copy for these is the error's own message — never invent new user-facing text; if fixed copy seems needed, stop and report it.
3. Forms that submit an action use `useActionState`; instant feedback uses `useOptimistic`. Context is read with `use(Context)`, not `useContext`.
4. Shared UI state used by several screens goes in a Zustand store in the owning slice's `model/`; everything else stays `useState`.
5. No `useMemo` / `useCallback` / `React.memo` (React Compiler will be turned on at the end of Phase 5). Do not put functions in `useEffect` dependency arrays. Derive values during render instead of syncing them with effects.
6. Behavior and markup stay the same: same text, same classes, same timing (current polling intervals), so the E2E and characterization tests keep passing unchanged.
