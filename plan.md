# Plan — Phase 1: action capture + hardening

Branch: `feat/phase1-action-capture`. Phase 0 (date bridge) is shipped through
1.4.1 on `main`; revisit the intermittent date behaviour AFTER Phase 1.

## Goal

`@action` capture should produce real Tasks the board, Dataview, and Remindian
all see, and the tool should be hardened to the `/software-workflow` principles:
hexagonal (pure domain vs Obsidian adapters), DRY, atomic writes, DDD naming.

## Target architecture (pragmatic hexagonal — not a cathedral)

- **Domain (pure, no `obsidian` import):**
  - `task-format.ts` — the Tasks emoji vocabulary (value object): `formatDue`,
    `formatCreated`, `formatDone`, `newTask`, `markDone`.
  - `action-capture.ts` — pure: given note text → rewritten text + the captured
    actions `[{text, blockId}]`. (extracted from `action-processor.ts`)
  - `date-bridge.ts` — pure `normalizeKanbanDates` (already).
- **Ports (interfaces):** `NoteGateway` (read/process), `BoardGateway` (locate
  board, file entries), `Clock` (`today()`), `IdFactory` (`newBlockId()`),
  `Notifier`, `BoardViewRefresher`.
- **Adapters (Obsidian):** thin implementations over `vault`, `metadataCache`,
  `Notice`, `workspace`.
- **Application (`main.ts`):** event → debounced `ChangeRouter` → use-cases,
  with adapters injected.

## Sequence (small safe steps, TDD) — ALL DONE on branch (41 tests)

1. [x] **task-format vocabulary** — `formatCreated`/`formatDone`/`newTask` (pure)
2. [x] **F1 capture format** — board entry is `- [ ] {text} ➕ {today} ^id` via
   `newTask`; injected `today` clock; in-note ACTION link unchanged
3. [x] **Separate debounces** — date reconcile (default 1s) vs action capture
   (default 10s); interval chosen via a board registry (seeded at layout-ready)
   so it's reliable despite Kanban's cache invalidation; routing stays at fire
   time; legacy `processRefreshInterval` migrated to the action delay
4. [x] **Pragmatic hexagonal** — pure `action-capture.ts` (grammar + transform)
   extracted; `action-processor.ts` is now a thin Obsidian adapter

Pending: merge `feat/phase1-action-capture` → `main` + release (needs go).

## Then (Phase 0 follow-up)
- Investigate intermittent date conversion on live Kanban edits (suspect another
  timing/refresh edge, distinct from the 1.4.1 routing fix).
- "Complete task here" command using `task-format.markDone` (writes `✅`).

## Deploy loop
push `main` → CI semantic-release → release → BRAT "Check for updates" → reload.
This branch merges to `main` when a coherent slice is ready (avoid half-baked
releases).
