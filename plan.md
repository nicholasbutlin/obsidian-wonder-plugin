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

## Sequence (small safe steps, TDD)

1. **task-format vocabulary** — add `CREATED_EMOJI`/`DONE_EMOJI`,
   `formatCreated`/`formatDone`, `newTask({text, created, blockId})`. Pure. ← step 1
2. **F1 capture format** — board entry becomes `- [ ] {text} ➕ {today} ^id`
   (canonical Tasks line) via `newTask`; inject a `today` clock into the capture.
   In-note ACTION link unchanged.
3. **Separate debounces** — date reconcile (fast, ~1s) vs action capture (slower,
   ~10s, so it doesn't fire mid-typing). Two named settings. Choose interval at
   schedule time via a `BoardRegistry` (seeded from metadataCache at load,
   updated at fire time) so it's reliable despite Kanban's cache invalidation;
   routing stays at fire time.
4. **Hexagonal extraction** — split `action-processor.ts` into pure
   `action-capture.ts` + thin Obsidian adapter; introduce the ports above; DRY
   the debounce/guard/read patterns. Refactor under green tests.

## Then (Phase 0 follow-up)
- Investigate intermittent date conversion on live Kanban edits (suspect another
  timing/refresh edge, distinct from the 1.4.1 routing fix).
- "Complete task here" command using `task-format.markDone` (writes `✅`).

## Deploy loop
push `main` → CI semantic-release → release → BRAT "Check for updates" → reload.
This branch merges to `main` when a coherent slice is ready (avoid half-baked
releases).
