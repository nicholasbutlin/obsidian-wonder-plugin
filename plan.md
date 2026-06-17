# Plan — Wonder Phase 0 F0a: Kanban date normalizer

Convert Kanban picker brace dates (`@{YYYY-MM-DD}`) to canonical Tasks
`📅 YYYY-MM-DD` on board files. Leave `@[[YYYY-MM-DD]]` reference stamps alone.
Verified against the live vault: date-only ISO picker, no time trigger, two
boards (`ToDo Auto.md`, `ToDo General.md`), `link-date-to-daily-note: false`.

## Action items

- [x] `src/task-format.ts` — `DUE_EMOJI`, `formatDue(date)` (single source of due token)
- [x] `src/date-bridge.ts` — pure `normalizeKanbanDates(text)` + `DateNormalizer` class (uses `formatDue`)
- [x] `src/date-bridge.test.ts` — pure-fn tests (#1–6) + class tests via FakeVault (#7–9)
- [x] `src/settings.ts` — `normalizeKanbanDates: boolean` (default true) + `addToggleSetting` + toggle row
- [x] `src/main.ts` — route by file type: board → normalize, note → action-scan; extract `debounce(path, fn)`
- [x] `src/main.test.ts` — add `metadataCache` to mock; routing tests (board→normalize, note→scan); keep debounce tests
- [x] `npm test` green (19 passed); `npm run build` clean; `npm run lint` clean

## F0a.1 — replace-on-repick (done)

Kanban can't edit a 📅 it doesn't own, so re-picking inserts a fresh @{} beside
the existing 📅. Without reconciliation that leaves two due dates. Fix: per-line,
a picked brace date drops any stale 📅 on that line before converting → one
canonical due date. Picker now works as a re-setter (opens blank; minor nit).

- [x] line-by-line `reconcileLine`; strip stale 📅 only on lines with a new @{}
- [x] tests: replace, line-scoped replace, idempotent-through-replace (22 passing)
- [x] build + lint clean

## Remaining (manual / out of this slice)

- [ ] Released 1.1.0 (F0a). Decide: push + release F0a.1
- [ ] Enable Kanban "Move task data to card footer" so 📅 renders on cards
- [ ] Manual board check: reload plugin → re-pick a date → confirm single `📅`, Tasks clean
- [ ] F0b spike (overdue colour pills) — separate slice

## Test list (canon-tdd)

1. `@{2026-06-20}` → `📅 2026-06-20`
2. `@{2026-06-20 09:00}` / `@{2026-06-20T09:00}` → `📅 2026-06-20` (defensive; time dropped)
3. `@[[2026-03-27]]` unchanged
4. line with both → only brace converts
5. idempotent
6. no brace dates → identical string (drives no-op-write guard)
7. `normalize()` writes converted content for a board file
8. `normalize()` makes no write when nothing to convert (call counter)
9. `%% kanban:settings %%` block round-trips untouched
